// "그때 샀더라면" 시뮬레이터: 매수 시점(달러 가격·환율)과 현재 시세·환율로 지금 가치·손익을 계산한다.
import { formatWon, formatSigned } from "./format.js";
import { round2 } from "./app.js";

const $ = (sel) => document.querySelector(sel);

// 매수 시점 가격·환율·투자금 → {currentKrw, profitKrw, pct, direction} (순수)
export function simulate(amountKrw, buyUsd, buyFx, nowUsd, nowFx) {
  const quantity = amountKrw / (buyUsd * buyFx);
  const currentKrw = quantity * nowUsd * nowFx;
  const profitKrw = currentKrw - amountKrw;
  const pct = round2((profitKrw / amountKrw) * 100);
  return {
    currentKrw,
    profitKrw,
    pct,
    direction: profitKrw > 0 ? "up" : profitKrw < 0 ? "down" : "flat",
  };
}

// #sim-coin 의 선택에 맞는 행을 고른다
function simRow(result, coinId) {
  return result.rows.find((r) => r.id === coinId) || null;
}

// 매수 시점 값을 24시간 전 기준으로 채운다: buyUsd = 현재 USD ÷ (1+usdChangePct/100), buyFx = 현재 환율.
// 데이터에는 24시간 전 환율이 없어 환율은 현재 값으로 채우고(사용자가 바꿀 수 있음을 안내한다).
export function simDefaults(result) {
  const coin = $("#sim-coin");
  const row = simRow(result, coin.value);
  if (!row) return;
  const buyUsd = row.usdPrice / (1 + (row.usdChangePct / 100));
  $("#sim-buy-usd").value = String(Math.round(buyUsd * 100) / 100);
  $("#sim-buy-fx").value = String(result.usdKrw);
  if (!$("#sim-amount").value || Number($("#sim-amount").value) <= 0) {
    $("#sim-amount").value = "1000000";
  }
}

// 선택된 코인을 바꾸면 그 코인의 24시간 전 가격으로 기본값을 채운다.
export function simCoinChange(result) {
  simDefaults(result);
  renderSimResult(result);
}

// 입력 필드(금액·매수 가격·환율·코인)에 이벤트 연결: 값이 바뀌면 #sim-result 즉시 갱신.
export function bindSim(result) {
  for (const sel of ["#sim-amount", "#sim-buy-usd", "#sim-buy-fx"]) {
    $(sel).addEventListener("input", () => renderSimResult(result));
  }
  $("#sim-coin").addEventListener("change", () => simCoinChange(result));
}

// 입력값으로 결과를 계산해 #sim-result 에 쓴다. 값이 없거나 0 이하이면 한국어 안내.
// 부호·색(up/down/flat)은 목록과 같은 방식으로: ds-up(빨강)·ds-down(파랑)·ds-flat(회색).
export function renderSimResult(result) {
  const out = $("#sim-result");
  const coinId = $("#sim-coin").value;
  const row = simRow(result, coinId);
  const amount = Number($("#sim-amount").value);
  const buyUsd = Number($("#sim-buy-usd").value);
  const buyFx = Number($("#sim-buy-fx").value);
  out.textContent = "";
  if (!row) return;
  if (!(amount > 0) || !(buyUsd > 0) || !(buyFx > 0)) {
    out.textContent = "투자금·매수 가격·환율을 0보다 큰 숫자로 입력해 주세요. 빈 칸은 24시간 전 값으로 채워 드립니다.";
    return;
  }
  const s = simulate(amount, buyUsd, buyFx, row.usdPrice, result.usdKrw);
  const cls = s.direction === "up" ? "ds-up" : s.direction === "down" ? "ds-down" : "ds-flat";
  const line = document.createElement("span");
  line.className = cls;
  line.textContent =
    formatWon(amount) + "원 → 지금 " + formatWon(Math.round(s.currentKrw)) + "원 (" +
    formatSigned(s.pct) + "%, 코인 " + formatSigned(row.usdChangePct) + "% · 환율 " +
    formatSigned(row.fxEffectPct) + "%)";
  // NOTE: percent unit for fx effect
  const hint = document.createElement("span");
  hint.className = "ds-hint";
  hint.style.display = "block";
  hint.textContent =
    "매수 시점 값은 24시간 전 가격·환율로 채워 있어요. 원하는 값으로 고치면 바로 다시 계산해요.";
  out.append(line, hint);
}
