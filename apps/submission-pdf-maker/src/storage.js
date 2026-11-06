// KoFilePDF — 저장 모듈: localStorage(한 키)에 목표 용량과 최대 20건 변환 기록을 읽고 쓰고,
// 내보내기 문자열 생성과 가져오기 데이터 검증을 처리한다. 이미지는 저장하지 않는다.

export const STORAGE_KEY = 'kofilepdf.submission.v1';
const HISTORY_MAX = 20;

// {targetMb: string, history: [...최신순, max 20]}
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { targetMb: '5', history: [] };
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object');
    const targetMb = typeof data.targetMb === 'string' ? data.targetMb : '5';
    const history = Array.isArray(data.history) ? data.history.slice(0, HISTORY_MAX) : [];
    return { targetMb, history };
  } catch {
    return { targetMb: '5', history: [] };
  }
}

// localStorage 로 저장(쓰기 실패 예: 용량)은 null 반환으로 알려 준다.
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ targetMb: state.targetMb, history: state.history }));
    return null;
  } catch {
    return '설정을 브라우저에 저장하지 못했어요. 용량이 부족할 수 있습니다.';
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 이미 없어도 무방
  }
}

// 내보내기 파일 내용(kofilepdf-data.json)
export function exportStateJson(state) {
  return JSON.stringify({ targetMb: state.targetMb, history: state.history });
}

// 가져오기 검증: 객체이고 targetMb 가 0~100 숫자, history 가 유효한 기록 배열이어야 한다.
function validRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (r.label !== 'example' && r.label !== 'files') return false;
  if (typeof r.pageCount !== 'number' || !Number.isInteger(r.pageCount) || r.pageCount < 1) return false;
  if (typeof r.targetMb !== 'number' || !Number.isFinite(r.targetMb) || r.targetMb <= 0) return false;
  if (typeof r.finalBytes !== 'number' || !Number.isFinite(r.finalBytes) || r.finalBytes < 0) return false;
  if (r.ok !== true && r.ok !== false) return false;
  return true;
}

// 유효하면 {targetMb: string, history: [...]} 반환, 아니면 null.
export function importStateJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (typeof data.targetMb !== 'number' || !Number.isFinite(data.targetMb) || data.targetMb < 0 || data.targetMb > 100) return null;
  if (!Array.isArray(data.history) || data.history.some((r) => !validRecord(r))) return null;
  return { targetMb: String(data.targetMb), history: data.history.slice(0, HISTORY_MAX) };
}
