// 구독 요금 로직: 청구 통화(원화/달러), 명세서 예상액(부가세·수수료), 환율 증감 계산.
// CHANGES #2·#3·#5 — 기본 6종도 청구 통화 기준으로 계산하고, 명세서 금액에 부가세 10% + 카드 수수료 1.5%를 붙인다.
import { PLAN_CATALOG, DEFAULT_BASELINE_KRW_RATE } from "./calc.js";

export { DEFAULT_BASELINE_KRW_RATE as BASELINE_KRW_RATE };

// 명세서 예상액에 붙이는 요율(부가세 10% + 카드 해외결제 수수료 1.5%).
export const ESTIMATE_TAX = 0.1;
export const ESTIMATE_FEE = 0.015;

// 기본 6종: 청구 통화 기준으로. 국내 넷플릭스는 원화 청구(국내 정가), 나머지는 달러.
export const SERVICES = Object.values(PLAN_CATALOG).map((p) => ({ ...p }));

for (const s of SERVICES) {
  if (s.id === "netflix_standard") { s.billing = "krw"; s.monthlyKrw = 13500; }
  else if (s.id === "netflix_premium") { s.billing = "krw"; s.monthlyKrw = 17000; }
  else { s.billing = "usd"; s.monthlyKrw = null; }
}

export const SERVICE_MAP = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

// 원화 청구: 부가세 이미 포함 → 수수료 1.5%만. 달러: 부가세 10% + 수수료 1.5%.
export function estimateBill(monthlyKrw, billing = "usd") {
  return Math.round(monthlyKrw * 1.1 * (1 + (billing === "krw" ? 0 : ESTIMATE_FEE)));
}

// 2026-04 평균 기준(1380) 원화 환산 금액.
export function baselineKrwFor(monthlyUsd, baselineRate = DEFAULT_BASELINE_KRW_RATE) {
  return Math.round(monthlyUsd * baselineRate);
}

// 명세서 예상액: 표시 가격(원화) × 부가세·수수료.
export function estimateForRow(monthlyKrw, billing = "usd") {
  return estimateBill(monthlyKrw, billing);
}
