// localStorage "subkr.state.v1" 키 하나로 선택 요금제·추가 서비스·기준 환율을 읽고 쓴다.
import { DEFAULT_STATE, PLAN_CATALOG } from "./calc.js";
import { SERVICE_MAP } from "./services.js";

export const STORAGE_KEY = "subkr.state.v1";

export function loadState() {
  const fallback = {
    selectedPlanIds: [...DEFAULT_STATE.selectedPlanIds],
    extraIds: [],
    baselineKrwRate: DEFAULT_STATE.baselineKrwRate,
    billingDays: {},
    fxRefDay: null,
  };
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
  const selectedPlanIds =
    Array.isArray(parsed.selectedPlanIds) && parsed.selectedPlanIds.every((id) => typeof id === "string" && PLAN_CATALOG[id])
      ? parsed.selectedPlanIds
      : [...DEFAULT_STATE.selectedPlanIds];
  const extraIds =
    Array.isArray(parsed.extraIds) && parsed.extraIds.every((id) => typeof id === "string" && SERVICE_MAP[id])
      ? parsed.extraIds
      : [];
  const baselineKrwRate =
    typeof parsed.baselineKrwRate === "number" && Number.isFinite(parsed.baselineKrwRate) && parsed.baselineKrwRate > 0
      ? parsed.baselineKrwRate
      : DEFAULT_STATE.baselineKrwRate;
  // 결제일(매월 N일): 값이 없거나 깨지면 {} 로 대체한다.
  const billingDays =
    parsed.billingDays && typeof parsed.billingDays === "object" && !Array.isArray(parsed.billingDays)
      ? parsed.billingDays
      : {};
  // 환율 기준일: 값이 없거나 깨지면 null.
  const fxRefDay =
    typeof parsed.fxRefDay === "string" && parsed.fxRefDay ? parsed.fxRefDay : null;
  return { selectedPlanIds, extraIds, baselineKrwRate, billingDays, fxRefDay };
}

export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패해도 화면은 계속 동작한다.
  }
}

export function clearState() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}
