// localStorage에 단일 키로 저장·복원: 데이터 모드(실시간/예시), 최소 컨텍스트, 모드별 최대 60개 날짜별 비용 기록.

const STORAGE_KEY = 'llm.task.costs.v1';
const HISTORY_LIMIT = 60;
const MODES = ['live', 'example'];
const COST_KEYS = ['coding', 'testing', 'docs', 'ops'];

function defaultState() {
  return { version: 1, mode: 'live', minContext: 0, history: { live: [], example: [] } };
}

// 아무 문제 없는 상태 객체로 정규화(누락 필드는 기본값)
function normalizeState(raw) {
  const state = defaultState();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.mode === 'live' || raw.mode === 'example') state.mode = raw.mode;
    if (typeof raw.minContext === 'number' && Number.isSafeInteger(raw.minContext) && raw.minContext >= 0) state.minContext = raw.minContext;
    if (raw.history && typeof raw.history === 'object' && !Array.isArray(raw.history)) {
      for (const mode of MODES) {
        const list = raw.history[mode];
        if (Array.isArray(list)) {
          state.history[mode] = list
            .filter((s) => s && typeof s === 'object' && !Array.isArray(s) && typeof s.asOf === 'string' && s.costs && typeof s.costs === 'object' && !Array.isArray(s.costs))
            .map((s) => {
              const costs = {};
              for (const key of COST_KEYS) {
                const v = s.costs[key];
                costs[key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
              }
              return { asOf: s.asOf, costs };
            });
        }
      }
    }
  }
  return state;
}

export function loadState() {
  let raw = null;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text) raw = JSON.parse(text);
  } catch {
    raw = null; // 깨진 데이터는 기본값으로
  }
  return normalizeState(raw);
}

export function saveState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 성공한 렌더마다 호출: 같은 날짜(asOf) 기록은 바꾸고, 최신 60개만 남긴다.
export function recordSnapshot(state, mode, asOf, costs) {
  const list = state.history[mode];
  const snapshot = { asOf, costs: { coding: null, testing: null, docs: null, ops: null } };
  for (const key of COST_KEYS) snapshot.costs[key] = typeof costs[key] === 'number' && Number.isFinite(costs[key]) ? costs[key] : null;
  const kept = list.filter((s) => s.asOf !== asOf);
  kept.push(snapshot);
  kept.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
  state.history[mode] = kept.slice(-HISTORY_LIMIT);
}

// 가져오기 파일 검증: {version:1, mode, minContext, history:{live,example}} 모양이 아니면 null
export function validateState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.version !== 1) return null;
  if (raw.mode !== 'live' && raw.mode !== 'example') return null;
  if (typeof raw.minContext !== 'number' || !Number.isSafeInteger(raw.minContext) || raw.minContext < 0) return null;
  if (!raw.history || typeof raw.history !== 'object' || Array.isArray(raw.history)) return null;
  for (const mode of MODES) {
    const list = raw.history[mode];
    if (!Array.isArray(list)) return null;
    for (const s of list) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
      if (typeof s.asOf !== 'string') return null;
      if (!s.costs || typeof s.costs !== 'object' || Array.isArray(s.costs)) return null;
      for (const key of COST_KEYS) {
        const v = s.costs[key];
        if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) return null;
      }
    }
  }
  return normalizeState(raw);
}

export function clearState() {
  window.localStorage.removeItem(STORAGE_KEY);
  return defaultState();
}
