// localStorage 에 상태 JSON 을 읽고 쓴다. 깨진 JSON 은 null.
export const STORAGE_KEY = "llmpick.state.v1";

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
