// localStorage 에 {entries, csvText, discard} 를 읽고 쓰고 지운다.
// SPEC '화면 (고정 id)' 은 키 'heicpack-state' 를, 설계/ARCH 는 'heicpack.state' 를 요구한다.
// 두 키에 똑같이 쓰고(읽기는 설계의 dot 키를 우선) 어느 기준에서 보아도 데이터가 보이다.
import { diagnoseIcloudExport } from './app.js';

const KEYS = ['heicpack-state', 'heicpack.state'];

export function isValidState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (!Array.isArray(state.entries) || typeof state.csvText !== 'string' || !state.discard || typeof state.discard !== 'object' || Array.isArray(state.discard)) return false;
  for (const e of state.entries) {
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.name !== 'string' || typeof e.size !== 'number') return false;
  }
  const { liveVideo, copy, editedOriginal } = state.discard;
  if (typeof liveVideo !== 'boolean' || typeof copy !== 'boolean' || typeof editedOriginal !== 'boolean') return false;
  try {
    diagnoseIcloudExport(state.entries, state.csvText, state.discard);
  } catch (e) {
    return false;
  }
  return true;
}

// 저장된 상태가 있으면 복원, 없거나 무효면 null. (dot 키 우선, 그 다음 고정 키)
export function loadState() {
  try {
    for (const key of KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const state = JSON.parse(raw);
      if (isValidState(state)) return state;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  const text = JSON.stringify(state);
  for (const key of KEYS) {
    try {
      localStorage.setItem(key, text);
    } catch {
      // 저장 실패(용량·프라이버시 모드)는 조용히 무시한다.
    }
  }
}

export function clearState() {
  for (const key of KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // 무시
    }
  }
}
