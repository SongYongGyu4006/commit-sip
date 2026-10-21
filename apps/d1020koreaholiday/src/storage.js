// 상태 {leaveDays, todayOverride, saved} 를 localStorage 키 하나로 읽고 쓰고 지운다.
import { isValidDate } from './format.js';

export const STORAGE_KEY = 'koreaholidayplan';

export function defaultState() {
  return { leaveDays: 5, todayOverride: null, saved: [] };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const p = JSON.parse(raw);
    const state = defaultState();
    if (p && typeof p === 'object') {
      if (Number.isInteger(p.leaveDays) && p.leaveDays >= 0 && p.leaveDays <= 7) state.leaveDays = p.leaveDays;
      if (p.todayOverride === null || isValidDate(p.todayOverride)) state.todayOverride = p.todayOverride;
      if (Array.isArray(p.saved)) {
        state.saved = p.saved
          .filter((s) => s && isValidDate(s.start) && isValidDate(s.end) && s.start <= s.end)
          .map((s) => ({ start: s.start, end: s.end }));
      }
    }
    return state;
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장소가 막혀 있어도 화면은 계속 동작한다.
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}

// 가져온 파일이 유효한 상태인지 검증한다. 유효하면 새 상태, 아니면 null.
export function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!Number.isInteger(data.leaveDays) || data.leaveDays < 0 || data.leaveDays > 7) return null;
  if (data.todayOverride !== null && !isValidDate(data.todayOverride)) return null;
  if (!Array.isArray(data.saved)) return null;
  const saved = [];
  for (const s of data.saved) {
    if (!s || typeof s !== 'object' || !isValidDate(s.start) || !isValidDate(s.end) || s.start > s.end) return null;
    saved.push({ start: s.start, end: s.end });
  }
  return { leaveDays: data.leaveDays, todayOverride: data.todayOverride, saved };
}

// 같은 시작·끝 조합을 이미 저장해 두면 그대로 둔다. (중복 방지)
export function addSaved(state, start, end) {
  const has = state.saved.some((s) => s.start === start && s.end === end);
  if (has) return state;
  return { ...state, saved: [...state.saved, { start, end }] };
}

export function removeSaved(state, start, end) {
  return { ...state, saved: state.saved.filter((s) => !(s.start === start && s.end === end)) };
}
