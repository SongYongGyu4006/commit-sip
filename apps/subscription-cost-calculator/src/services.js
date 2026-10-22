// 구독 요금 로직: 청구 통화(원화/달러), 명세서 예상액(부가세·수수료), 환율 증감 계산.
// CHANGES #1: 국내 원화 요금은 부가세 포함·수수료 없음(명세서 = 표시 가격), 달러 청구만 부가세 10% + 카드 수수료 1.5%.
// CHANGES #4: youtube_premium·spotify_premium은 한국 가격이 있는 서비스라 원화 청구로 고쳤다.
import { PLAN_CATALOG, DEFAULT_BASELINE_KRW_RATE } from "./calc.js";

export { DEFAULT_BASELINE_KRW_RATE as BASELINE_KRW_RATE };

// 달러 청구 명세서에 붙이는 요율(부가세 10% + 카드 해외결제 수수료 1.5%).
export const ESTIMATE_TAX = 0.1;
export const ESTIMATE_FEE = 0.015;

// 청구 통화로 나뉜 기본 6종. monthlyKrw: 원화 청구 요금의 국내 정가(부가세 포함), 달러 청구는 null(실시간 환율로 계산).
export const SERVICES = Object.values(PLAN_CATALOG).map((p) => ({ ...p }));

for (const s of SERVICES) {
  if (s.id === "netflix_standard") { s.billing = "krw"; s.monthlyKrw = 13500; }
  else if (s.id === "netflix_premium") { s.billing = "krw"; s.monthlyKrw = 17000; }
  else if (s.id === "youtube_premium") { s.billing = "krw"; s.monthlyKrw = 14900; }
  else if (s.id === "spotify_premium") { s.billing = "krw"; s.monthlyKrw = 10900; }
  else { s.billing = "usd"; s.monthlyKrw = null; }
}

export const SERVICE_MAP = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

// 명세서 예상액: 원화 청구는 부가세 포함·수수료 없으므로 표시 가격을 그대로 돌려준다. 달러 청구만 ×1.1×1.015.
export function estimateBill(monthlyKrw, billing = "usd") {
  if (billing === "krw") return Math.round(monthlyKrw);
  return Math.round(monthlyKrw * (1 + ESTIMATE_TAX) * (1 + ESTIMATE_FEE));
}

// 2026-04 평균 기준(1380) 원화 환산 금액.
export function baselineKrwFor(monthlyUsd, baselineRate = DEFAULT_BASELINE_KRW_RATE) {
  return Math.round(monthlyUsd * baselineRate);
}

// 한 줄 금액: 원화 청구면 국내 정가, 달러 청구면 오늘 환율 환산액.
export function displayKrw(plan, krwRate) {
  const s = SERVICE_MAP[plan.id];
  return s.billing === "krw" ? s.monthlyKrw : Math.round(plan.monthlyUsd * krwRate);
}
