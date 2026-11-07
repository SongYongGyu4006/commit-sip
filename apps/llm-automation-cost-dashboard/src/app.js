// 순수 계산: 모델 목록·설정·기준 시각 → 4개 작업군별 최저 비용, 4주 전 대비 변화율, 최근 7일 신규·인기 모델 요약.
// 시계·전역·localStorage에 절대 의존하지 않는다.

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DAY = 86400;

// 고정 작업군: 코딩·테스트·문서화·운영
const TASK_GROUPS = [
  { key: 'coding', inputTokens: 20000, outputTokens: 4000, minContext: 32000 },
  { key: 'testing', inputTokens: 12000, outputTokens: 3000, minContext: 16000 },
  { key: 'docs', inputTokens: 8000, outputTokens: 2000, minContext: 8000 },
  { key: 'ops', inputTokens: 30000, outputTokens: 1000, minContext: 64000 }
];

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]';
}

function isPlainArray(v) {
  return Array.isArray(v) && Object.prototype.toString.call(v) === '[object Array]';
}

function roundCost(x) {
  return Math.round(x * 1e6) / 1e6;
}

// 작업군 하나에 대한 모델 자격: 조건 하나라도 안 들면 조용히 제외(예외 없음)
function modelEligibleFor(row, group, minContext, nowSec) {
  if (!isPlainObject(row)) return false;
  if (typeof row.id !== 'string') return false;
  if (typeof row.created !== 'number' || !Number.isFinite(row.created) || row.created > nowSec) return false;
  const ctx = row.context_length;
  if (typeof ctx !== 'number' || !Number.isFinite(ctx) || ctx < Math.max(group.minContext, minContext)) return false;
  const modalities = row.architecture && row.architecture.output_modalities;
  if (!Array.isArray(modalities) || !modalities.includes('text')) return false;
  const prompt = Number(row.pricing && row.pricing.prompt);
  const completion = Number(row.pricing && row.pricing.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0 || prompt + completion <= 0) return false;
  return true;
}

// 가장 싼 모델: 같은 값이면 id가 작은 쪽(문자열 비교)
function pickCheapest(els, group) {
  let best = null;
  for (const m of els) {
    if (best === null || m.cost < best.cost || (m.cost === best.cost && m.id < best.id)) best = m;
  }
  return best;
}

function summarizeTaskCosts(models, hfRows, settings, nowIso) {
  if (!isPlainArray(models)) throw new TypeError('models must be an array');
  if (!isPlainArray(hfRows)) throw new TypeError('hfRows must be an array');
  if (!isPlainObject(settings)) throw new TypeError('settings must be a plain object');
  if (typeof settings.minContext !== 'number') throw new TypeError('settings.minContext must be a number');
  if (!Number.isSafeInteger(settings.minContext) || settings.minContext < 0) throw new RangeError('settings.minContext must be a nonnegative safe integer');
  if (typeof nowIso !== 'string') throw new TypeError('nowIso must be a string');
  if (!ISO_RE.test(nowIso)) throw new RangeError('nowIso must match YYYY-MM-DDTHH:MM:SSZ');
  const parsedMs = Date.parse(nowIso);
  if (Number.isNaN(parsedMs)) throw new RangeError('nowIso must be a valid date');

  const nowSec = parsedMs / 1000;
  const minContext = settings.minContext;
  const baselineCutoff = nowSec - 28 * DAY;

  const tasks = TASK_GROUPS.map((group) => {
    const eligible = [];
    const baseline = [];
    for (const row of models) {
      if (!modelEligibleFor(row, group, minContext, nowSec)) continue;
      const cost = roundCost(Number(row.pricing.prompt) * group.inputTokens + Number(row.pricing.completion) * group.outputTokens);
      const entry = { id: row.id, name: typeof row.name === 'string' ? row.name : row.id, cost };
      eligible.push(entry);
      if (row.created <= baselineCutoff) baseline.push(entry);
    }
    const cheapest = pickCheapest(eligible, group);
    const base = pickCheapest(baseline, group);
    let changePct = null;
    if (cheapest && base && base.cost > 0) {
      changePct = Math.round(((cheapest.cost - base.cost) / base.cost) * 100 * 10) / 10;
      if (changePct === 0) changePct = 0; // -0 방지
    }
    return {
      key: group.key,
      inputTokens: group.inputTokens,
      outputTokens: group.outputTokens,
      eligibleCount: eligible.length,
      cheapest: cheapest ? { id: cheapest.id, name: cheapest.name, costUsd: cheapest.cost } : null,
      baselineCostUsd: base ? base.cost : null,
      changePct
    };
  });

  let newCount7d = 0;
  let topTrendingId = null;
  let topScore = null;
  for (const row of hfRows) {
    if (!isPlainObject(row) || typeof row.id !== 'string') continue;
    const createdMs = Date.parse(row.createdAt);
    if (!Number.isNaN(createdMs)) {
      const sec = createdMs / 1000;
      if (sec >= nowSec - 7 * DAY && sec <= nowSec) newCount7d++;
    }
    const score = typeof row.trendingScore === 'number' ? row.trendingScore : 0;
    if (topScore === null || score > topScore || (score === topScore && row.id < topTrendingId)) {
      topScore = score;
      topTrendingId = row.id;
    }
  }

  return { asOf: nowIso.slice(0, 10), tasks, hf: { newCount7d, topTrendingId } };
}

export { summarizeTaskCosts };
