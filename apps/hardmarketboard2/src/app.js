// AI 모델 시장 판 — Hugging Face 인기 모델과 OpenRouter API 가격을 모델 계열로 짝짓는 순수 로직.
// ESM 모듈: Node에서 import해도 DOM/네트워크/클록/랜덤/모듈 스코프 부수 효과 없음.
// 브라우저에서는 <script type="module"> 로 로드해 window.buildModelBoard 를 노출한다.

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// 이름 정규화: 소문자 → '/'까지의 org 접두 제거 → 마지막 ':' 이후 alias 제거 → a-z·0-9만 남김
function normalizeName(raw) {
  let s = String(raw).toLowerCase();
  const slash = s.indexOf('/');
  if (slash !== -1) s = s.slice(slash + 1);
  const colon = s.lastIndexOf(':');
  if (colon !== -1) s = s.slice(0, colon);
  return s.replace(/[^a-z0-9]/g, '');
}

// 토큰당 달러 가격 → 100만 토큰당 달러. 유한 숫자·숫자 문자열만 변환, 아니면 null.
function toPerMillion(value) {
  if (typeof value === 'number') return isFinite(value) ? value * 1e6 : null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return null;
    const n = Number(t);
    return isFinite(n) ? n * 1e6 : null;
  }
  return null;
}

function deriveHf(row) {
  const st = hasOwn(row, 'safetensors') ? row.safetensors : null;
  const parameters = st != null && st.total != null ? st.total : null;
  return {
    name: row.id,
    parameters,
    likes: hasOwn(row, 'likes') ? row.likes : null,
    trendingScore: hasOwn(row, 'trendingScore') ? row.trendingScore : null,
    downloads: hasOwn(row, 'downloads') ? row.downloads : null,
  };
}

function deriveOpenrouter(row) {
  const pr = hasOwn(row, 'pricing') ? row.pricing : null;
  const promptPrice = pr != null && hasOwn(pr, 'prompt') ? toPerMillion(pr.prompt) : null;
  const completionPrice = pr != null && hasOwn(pr, 'completion') ? toPerMillion(pr.completion) : null;
  let pricePerMillion = null;
  if (promptPrice != null && completionPrice != null) {
    pricePerMillion = Math.round((promptPrice + completionPrice) * 1000) / 1000;
  }
  return {
    name: row.id,
    contextLength: hasOwn(row, 'context_length') ? row.context_length : null,
    promptPrice,
    completionPrice,
    pricePerMillion,
  };
}

/**
 * Hugging Face 행과 OpenRouter 행을 모델 계열(family)로 짝짓는다.
 * @param {Array<object>} hfRows data/hf_models.json 의 원본 배열
 * @param {object} openrouterData data/openrouter_models.json 의 원본 객체 (data 키 필수 아님)
 * @returns {{rows: Array<{family: string, hf: object|null, openrouter: object|null}>, pairedCount: number, unpairedCount: number}}
 */
export function buildModelBoard(hfRows, openrouterData) {
  if (!Array.isArray(hfRows)) throw new TypeError('hfRows must be an array');
  if (!isPlainObject(openrouterData)) throw new TypeError('openrouterData must be a plain object');
  const orRows = hasOwn(openrouterData, 'data') ? openrouterData.data : [];
  if (!Array.isArray(orRows)) throw new TypeError('openrouterData.data must be an array');

  const hfEntries = hfRows.map((row) => {
    if (!isPlainObject(row)) throw new TypeError('hf row must be a plain object');
    if (typeof row.id !== 'string') throw new TypeError('hf row id must be a string');
    if (hasOwn(row, 'likes') && !isNumber(row.likes)) throw new TypeError('hf likes must be a number');
    if (hasOwn(row, 'trendingScore') && !isNumber(row.trendingScore)) throw new TypeError('hf trendingScore must be a number');
    if (hasOwn(row, 'downloads') && !isNumber(row.downloads)) throw new TypeError('hf downloads must be a number');
    const st = hasOwn(row, 'safetensors') ? row.safetensors : null;
    if (st != null && !isPlainObject(st)) throw new TypeError('hf safetensors must be a plain object');
    if (st != null && (st.total == null || !isNumber(st.total))) throw new TypeError('hf safetensors.total must be a number');
    const family = normalizeName(row.id);
    return {
      family,
      familyRaw: row.id,
      hf: deriveHf(row),
      openrouter: null,
      openrouterMatch: family !== '' ? { key: family, openrouter: null, paired: false } : null,
    };
  });

  const orEntries = orRows.map((row) => {
    if (!isPlainObject(row)) throw new TypeError('openrouter data row must be a plain object');
    if (typeof row.id !== 'string') throw new TypeError('openrouter id must be a string');
    // context_length: 값이 존재(키가 있고 null 아님)하면서 number가 아니면 TypeError. null/부재는 미존재.
    if (hasOwn(row, 'context_length') && row.context_length != null && !isNumber(row.context_length)) {
      throw new TypeError('openrouter context_length must be a number');
    }
    const pr = hasOwn(row, 'pricing') ? row.pricing : null;
    if (pr != null && !isPlainObject(pr)) throw new TypeError('openrouter pricing must be a plain object');
    if (pr != null) {
      for (const k of ['prompt', 'completion']) {
        const v = pr[k];
        if (v != null && !(typeof v === 'number' || typeof v === 'string')) {
          throw new TypeError('openrouter pricing field must be a number or string');
        }
      }
    }
    const family = normalizeName(row.id);
    return { family, familyRaw: row.id, openrouter: deriveOpenrouter(row) };
  });

  // 짝짓기: 정규화 이름이 비어 있지 않고 정확히 일치하면 짝. family가 비어 있으면 짝 불가.
  let pairedCount = 0;
  let unpairedCount = 0;
  const rows = [];
  const orConsumed = new Set();

  for (const e of hfEntries) {
    if (e.openrouterMatch) {
      let matched = false;
      for (const o of orEntries) {
        if (o.family === e.openrouterMatch.key && !orConsumed.has(o)) {
          orConsumed.add(o);
          e.openrouter = o.openrouter;
          pairedCount += 1;
          matched = true;
          break;
        }
      }
      if (matched) {
        rows.push({ family: e.family, hf: e.hf, openrouter: e.openrouter });
        continue;
      }
    }
    if (e.family === '') e.family = e.familyRaw; // 정규화 결과가 비어 있을 때만 raw id 사용
    unpairedCount += 1;
    rows.push({ family: e.family, hf: e.hf, openrouter: null });
  }
  for (const o of orEntries) {
    if (orConsumed.has(o)) continue;
    const family = o.family === '' ? o.familyRaw : o.family;
    unpairedCount += 1;
    rows.push({ family, hf: null, openrouter: o.openrouter });
  }

  return { rows, pairedCount, unpairedCount };
}

// 브라우저에서만 실행되는 노출 (Node에서는 부수 효과 없음)
if (typeof window !== 'undefined') {
  window.buildModelBoard = buildModelBoard;
}
