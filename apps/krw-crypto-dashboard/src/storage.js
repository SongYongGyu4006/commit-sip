// localStorage "krcoinfx.state" = { coinIds } : 선택만 저장/복원(예시는 세션 한정)
const KEY = "krcoinfx.state";
export const DEFAULT_COIN_IDS = ["bitcoin", "ethereum"];
const KNOWN = ["bitcoin", "ethereum", "solana"];
const REQUIRED = ["bitcoin", "ethereum"];

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(state) {
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadCoinIds() {
  const s = read();
  return validateImport(s) || DEFAULT_COIN_IDS.slice();
}

// 새로고침하면 항상 실데이터로(SPEC: Reloading the page returns to live data), 예시는 세션 한정.
export function loadExample() {
  return false;
}

// 선택을 "krcoinfx.state" 에 저장한다.
export function saveCoinIds(coinIds) {
  write({ coinIds: coinIds.slice() });
}

// "예시로 해 보기"는 세션 한정(새로고침해도 실데이터로): 기존 coinIds 만 보존한다.
export function setExample() {
  const s = read();
  write({ coinIds: (s && s.coinIds) || DEFAULT_COIN_IDS.slice() });
}

export function clearCoinIds() {
  window.localStorage.removeItem(KEY);
}

// 가져온 파일의 coinIds가 유효한지: 문자열 배열, 각 항목은 bitcoin/ethereum/solana,
// 중복 없음, bitcoin·ethereum 포함 → 유효한 배열 반환, 아니면 null
export function validateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.coinIds)) {
    return null;
  }
  const ids = data.coinIds;
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== "string" || !KNOWN.includes(id) || seen.has(id)) return null;
    seen.add(id);
  }
  for (const id of REQUIRED) {
    if (!seen.has(id)) return null;
  }
  return ids.slice();
}
