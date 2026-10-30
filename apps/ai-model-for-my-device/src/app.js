// My Machine Model Fitter — 순수 로직
// 이 모듈은 브라우저 <script type="module">와 Node에서 모두 import할 수 있습니다.
// 순수 named export: planModels. 화면·저장소·네트워크·Date.now()을 사용하지 않습니다.

/**
 * roundHalfAwayFromZero: 반올림(+∞ 방향으로 0.5를 올림)
 * @param {number} value
 * @param {number} [dp=1] 소수 자릿수
 * @returns {number}
 */
export function roundHalfAwayFromZero(value, dp = 1) {
  const f = Math.pow(10, dp);
  return Math.round(value * f) / f;
}

const QUANT_FACTORS = { '4bit': 0.5, '8bit': 1.0 };
const QUANT_LABELS = { '4bit': '4bit', '8bit': '8bit' };
const DEFAULT_EXEC = {
  contextLength: 4096,
  batchSize: 1,
  layers: 32,
  headDim: 128,
  kvDtypeBytes: 2,
  runtimeReservationGb: 2.0,
};
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}


/** ISO-8601 문자열을 UTC epoch ms로 파싱(실패 시 null). */
function parseIsoInstant(s) {
  if (typeof s !== 'string' || s.trim() === '') return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * safetensors.total → parameters.
 * SPEC: "may be missing or null when the model has no reported parameter total".
 * 0 은 "보고되지 않은(total 0 = no reported total)"으로, 음수/비유한 값은
 * "untrusted(신뢰할 수 없는)"으로 각각 null 로 처리한다.
 * (SPEC: "a model whose estimatedTotalGb is null — i.e. whose selected-quantization
 *  weight estimate is null because parameters is missing or untrusted — is never
 *  runnable" — untrusted 값을 명시적으로 다루는 문장.)
 */
function parametersOf(row) {
  if (!isPlainObject(row.safetensors)) return null;
  const t = row.safetensors.total;
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null;
  return t;
}

/** exec 설정 합성: 누락/null/0 이하 값은 기본값으로. */
function resolveExec(exec) {
  const g = (v, d) =>
    v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v)) ? d : v;
  return {
    contextLength: g(exec && exec.contextLength, DEFAULT_EXEC.contextLength),
    batchSize: g(exec && exec.batchSize, DEFAULT_EXEC.batchSize),
    layers: g(exec && exec.layers, DEFAULT_EXEC.layers),
    headDim: g(exec && exec.headDim, DEFAULT_EXEC.headDim),
    kvDtypeBytes: g(exec && exec.kvDtypeBytes, DEFAULT_EXEC.kvDtypeBytes),
    runtimeReservationGb: g(exec && exec.runtimeReservationGb, DEFAULT_EXEC.runtimeReservationGb),
  };
}

/**
 * Hugging Face 원본 모델 행렬을 '내 기기에서 돌릴 수 있는지(추정)' 계획으로 변환합니다.
 * 순수 함수: 저장소/네트워크/시계 읽기 없음. nowIso 기준 시간 비교만 합니다.
 *
 * @param {Array<object>} models app/data/hf_models.json 의 원본 행(다운로드 시 필터됨)
 * @param {number} ramGb 내 PC RAM (GB, 양수)
 * @param {'4bit'|'8bit'} quantBit 양자화 선택
 * @param {string} nowIso ISO-8601 UTC 현재 시각
 * @param {object} [exec] 실행 설정(선택, 누락이면 기본값)
 * @returns {{models: Array<object>, runnableCount: number, notRunnableCount: number}}
 */
export function planModels(models, ramGb, quantBit, nowIso, exec) {
  // --- 인자 타입 검증 (TypeError) ---
  if (!Array.isArray(models)) throw new TypeError('models must be an array');
  if (typeof ramGb !== 'number' || !Number.isFinite(ramGb) || ramGb <= 0)
    throw new TypeError('ramGb must be a positive finite number');
  if (quantBit !== '4bit' && quantBit !== '8bit')
    throw new TypeError("quantBit must be '4bit' or '8bit'");
  if (typeof nowIso !== 'string') throw new TypeError('nowIso must be an ISO-8601 string');

  const execCfg = resolveExec(exec);
  const nowMs = parseIsoInstant(nowIso);
  const hidden = execCfg.layers * execCfg.headDim;
  // KV 캐시: 2·layers·batch·ctx·hidden·dtype(바이트) → GiB(1024^3), 소수 1자리(반올림)
  // 검증된 예시 기준(기본값: 32 레이어·128 dim·4096 컨텍스트·배치 1·2바이트) → 정확히 2
  const kvBytes =
    2 * execCfg.layers * execCfg.batchSize * execCfg.contextLength * hidden * execCfg.kvDtypeBytes;
  const kvDefault = roundHalfAwayFromZero(kvBytes / 1024 ** 3, 1);
  const reservationDefault = roundHalfAwayFromZero(execCfg.runtimeReservationGb, 1);

  let runnableCount = 0;
  let notRunnableCount = 0;

  const items = models.map((row) => {
    // --- 행 검증 (RangeError): 객체가 아니거나 id가 비어 있으면 예외 ---
    if (!isPlainObject(row)) throw new RangeError('each model row must be an object');
    if (typeof row.id !== 'string' || row.id.trim() === '') throw new RangeError('each model row needs a nonempty id');

    // safetensors.total — "raw safetensors.total or null if absent" (SPEC)
    // 없거나 null/미 정의, 또는 0/음수(신뢰할 수 없는) 값이면 null.
    const parameters = parametersOf(row);
    const isBaseModel = row.isBaseModel === undefined || row.isBaseModel === null ? true : row.isBaseModel === true;
    const rowKind = row.rowKind === undefined || row.rowKind === null ? null : row.rowKind;

    // 양자화별 이상적 가중치 메모리 추정(GB, 1dp) — 파라미터가 없으면 null
    const weight4 = parameters === null ? null : roundHalfAwayFromZero((parameters * QUANT_FACTORS['4bit']) / 1e9 * 1.2, 1);
    const weight8 = parameters === null ? null : roundHalfAwayFromZero((parameters * QUANT_FACTORS['8bit']) / 1e9 * 1.2, 1);
    const selectedWeight = quantBit === '4bit' ? weight4 : weight8;

    // KV 캐시(컨텍스트 길이·배치 기준) — 파라미터가 없으면 null
    const kvCacheGb = parameters === null ? null : kvDefault;

    // 총 필요 메모리 = 선택된 가중치 + 런타임 예약 + KV 캐시 (1dp); 가중치가 없으면 null
    const estimatedTotalGb = selectedWeight === null ? null : roundHalfAwayFromZero(selectedWeight + reservationDefault + kvCacheGb, 1);

    // NEW: createdAt 이 nowIso 기준 정확히 30일 이내(경계 포함; 30일 전이면 여전히 NEW)
    const createdMs = parseIsoInstant(row.createdAt);
    const isNew = createdMs !== null && nowMs !== null && nowMs - createdMs <= THIRTY_DAYS_MS;

    // runnable: base-model + 총 메모리 산출 + RAM 이하여야 함 (추정 적합)
    const runnable = isBaseModel === true && estimatedTotalGb !== null && estimatedTotalGb <= ramGb;

    if (isBaseModel) {
      if (runnable) runnableCount += 1;
      else notRunnableCount += 1;
    }

    // SPEC: 각 항목은 정확히 이 키 순서
    return {
      id: row.id,
      parameters,
      estimated4bitGb: weight4,
      estimated8bitGb: weight8,
      isBaseModel,
      rowKind,
      runtimeReservationGb: reservationDefault,
      kvCacheGb,
      estimatedTotalGb,
      likes: row.likes,
      trendingScore: row.trendingScore,
      downloads: row.downloads,
      isNew,
      runnable,
    };
  });

  // 정렬: trendingScore ↓ → downloads ↓ → likes ↓ (안정 정렬)
  items.sort((a, b) => {
    if (b.trendingScore !== a.trendingScore) return b.trendingScore - a.trendingScore;
    if (b.downloads !== a.downloads) return b.downloads - a.downloads;
    return b.likes - a.likes;
  });

  return { models: items, runnableCount, notRunnableCount };
}

/**
 * VRAM 적재 여부(보조 추정, 순수 함수). planModels 의 판정(RAM 기준)은 건드리지 않고
 * estimatedTotalGb 만 받아 VRAM 이 충분하면 전량 적재, 부족하면 오프로딩 필요,
 * 파라미터 미상(estimatedTotalGb null)이면 unknown.
 * @param {object} item planModels 반환 models 의 한 항목
 * @param {number|null} vramGb 선택한 VRAM(GB). null/누락이면 판정 불가 → unknown
 * @returns {'vram-full'|'offload'|'unknown'}
 */
export function fitByVram(item, vramGb) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('item must be a planModels model object');
  }
  const total = item.estimatedTotalGb;
  if (total === null || total === undefined) return 'unknown';
  if (typeof vramGb !== 'number' || !Number.isFinite(vramGb) || vramGb < 0) return 'unknown';
  return vramGb >= total ? 'vram-full' : 'offload';
}

/**
 * 보기 순서 정렬(보조, 순수 함수). planModels 반환 models 배열을 받아
 * mode('trending'|'downloads'|'optimized')로 정렬된 복사본을 반환 — 원배열 불변, 항목 키 순서 보존.
 * trending: trendingScore↓→downloads↓→likes↓(= planModels 기본 순서)
 * downloads: downloads↓
 * optimized: 실행 가능(추정)인 모델(runnable)을 앞으로, 그중 다운로드 많음순.
 *   불가능한 행(추정 불가·RAM 부족)은 뒤로. ramGb 도 없으면 현재 순서 유지.
 * @param {Array<object>} items planModels 반환 models
 * @param {'trending'|'downloads'|'optimized'} mode
 * @param {number} [ramGb] 'optimized' 모드 기준 RAM
 * @returns {Array<object>}
 */
export function rankModels(items, mode, ramGb) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const arr = items.slice();
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  switch (mode) {
    case 'downloads':
      arr.sort((a, b) => num(b.downloads) - num(a.downloads));
      break;
    case 'optimized':
      // 가능한(추정) 모델이 맨 앞에, 그중 많이 사용(다운로드↓)순
      arr.sort((a, b) => {
        if (!!a.runnable !== !!b.runnable) return a.runnable ? -1 : 1;
        return num(b.downloads) - num(a.downloads);
      });
      break;
    case 'trending':
    default:
      arr.sort((a, b) => {
        if (num(b.trendingScore) !== num(a.trendingScore)) return num(b.trendingScore) - num(a.trendingScore);
        if (num(b.downloads) !== num(a.downloads)) return num(b.downloads) - num(a.downloads);
        return num(b.likes) - num(a.likes);
      });
      break;
  }
  return arr;
}

// (참고) 화면에서 쓰는 KST 포맷 헬퍼 — 순수 함수
export function formatKstDate(iso) {
  const ms = parseIsoInstant(iso);
  if (ms === null) return null;
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')} KST`;
}
