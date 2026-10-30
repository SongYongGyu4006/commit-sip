// 대시보드를 매번 처음부터 다시 그린다(누적 상태 없음, li 중복 없음)
// 구조: 띠(오늘 1$) → 답 카드(24시간 원화 변동) → 코인 목록 → 접힌 구역(흐름·시뮬레이터·차트)
import { formatWon, formatRate, formatSigned, coinName, formatRelativeTime, barWidth } from "./format.js";
import { round2 } from "./app.js";
import { renderAllCharts, renderFlowCharts } from "./chart.js";
import { simDefaults, renderSimResult, simCoinChange } from "./simulator.js";

const $ = (sel) => document.querySelector(sel);
const hueOf = (name) => [...name].reduce((s, c) => s + c.codePointAt(0), 0) % 8;
const dirClass = (dir) => (dir === "up" ? "ds-up" : dir === "down" ? "ds-down" : "ds-flat");

// 환율 효과 = 24시간 원화 변동 − (24시간 달러 변동 + 24시간 환율 변동).
// 환율 효과%는 원화 변동의 부호(달러·환율 중 어느 쪽인지가 아니라 "원화로는 이만큼")로 표시한다.
function fxEffectPct(r) {
  const fxChangePct = r.prevFx ? (r.usdKrw / r.prevFx - 1) * 100 : 0;
  return round2(r.krwChangePct - r.usdChangePct - fxChangePct);
}

// 24시간 원화 실질 변동(= 달러 + 환율) — 환율 효과는 24시간 전 환율과 비교해 계산
function renderAnswerCard(result) {
  const rows = result.rows;
  const num = $("#answer-num");
  num.className = "ds-answer-num " + dirClass(rows[0].direction);
  num.textContent = formatSigned(rows[0].krwChangePct) + "%";
  const small = document.createElement("small");
  small.textContent = "24시간";
  num.appendChild(small);

  let best = rows[0];
  let worst = rows[0];
  for (const r of rows) {
    if (r.krwChangePct > best.krwChangePct) best = r;
    if (r.krwChangePct < worst.krwChangePct) worst = r;
  }
  const same = rows.length < 2 || best.id === worst.id;
  $("#answer-text").textContent =
    rows.length + "개 코인 중 " + coinName(best.id) + "이(가) 가장 많이 " +
    (best.krwChangePct >= 0 ? "올라" : "내려") + "요" +
    (same ? "" : ", " + coinName(worst.id) + "은(는) " + formatSigned(worst.krwChangePct) + "%로 가장 적게") +
    ". 원화 변동은 달러 변동과 환율 효과의 합이에요.";

  // 보조 숫자: 오늘 1$ 환율
  const rate = $("#answer-rate");
  rate.textContent = formatRate(result.usdKrw);
  rate.className = "ds-num";

  const w = rows.reduce((s, r) => s + r.krwPrice, 0);
  const avgUsd = w ? rows.reduce((s, r) => s + r.usdChangePct * r.krwPrice, 0) / w : 0;
  const avgFx = w ? rows.reduce((s, r) => s + fxEffectPct(r) * r.krwPrice, 0) / w : 0;
  const usdEl = $("#answer-usd");
  const fxEl = $("#answer-fx");
  usdEl.textContent = formatSigned(avgUsd) + "%";
  usdEl.className = "ds-num " + dirClass(avgUsd > 0 ? "up" : avgUsd < 0 ? "down" : "flat");
  fxEl.textContent = formatSigned(avgFx) + "%";
  fxEl.className = "ds-num " + dirClass(avgFx > 0 ? "up" : avgFx < 0 ? "down" : "flat");
}

// 코인 목록: 아바타 · 이름(실질 변동 뱃지) · 보조(달러·환율) · 오른쪽(원화 금액) + 실질 변동 막대
function renderCoinList(result) {
  const list = $("#coin-list");
  list.textContent = "";
  for (const row of result.rows) {
    const name = coinName(row.id);
    const dir = row.direction;

    const li = document.createElement("li");
    li.className = "coin-row ds-list-item";
    li.dataset.id = row.id;

    const avatar = document.createElement("span");
    avatar.className = "ds-avatar ds-avatar-s";
    avatar.dataset.hue = String(hueOf(name));
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = name.slice(0, 1);

    const main = document.createElement("div");
    main.className = "ds-list-main";

    const titleRow = document.createElement("div");
    titleRow.className = "coin-title-row";
    const title = document.createElement("span");
    title.className = "coin-name ds-list-title";
    title.textContent = name;
    const real = document.createElement("span");
    real.className = "real-change " + dir;
    real.textContent = "24시간 " + formatSigned(row.krwChangePct) + "%";
    titleRow.append(title, real);

    const sub = document.createElement("span");
    sub.className = "ds-list-sub";
    const usd = document.createElement("span");
    usd.className = "usd-change ds-num";
    usd.textContent = "달러 " + formatSigned(row.usdChangePct) + "%";
    const fx = document.createElement("span");
    fx.className = "fx-effect ds-num";
    fx.textContent = "환율 " + formatSigned(fxEffectPct(row)) + "%";
    sub.append(usd, fx);

    main.append(titleRow, sub);

    const end = document.createElement("div");
    end.className = "ds-list-end";
    const price = document.createElement("span");
    price.className = "krw-price ds-list-amount ds-num";
    price.textContent = "₩" + formatWon(row.krwPrice);
    const realAmount = document.createElement("span");
    realAmount.className = "real-amount ds-hint ds-num";
    const delta = row.krwPrice - row.prevKrwPrice;
    realAmount.textContent = "24시간 " + (delta > 0 ? "+" : delta < 0 ? "-" : "") + formatWon(Math.abs(delta)) + "원";
    end.append(price, realAmount);

    const barWrap = document.createElement("div");
    barWrap.className = "bar-wrap";
    const bar = document.createElement("div");
    bar.className = "real-bar " + dir;
    bar.style.width = barWidth(row.krwChangePct) + "%";
    barWrap.appendChild(bar);

    li.append(avatar, main, end, barWrap);
    list.appendChild(li);
  }
}

export function renderDashboard(result, meta, isExample) {
  // 띠: 환율은 "오늘 1$" 기준 정보(데이터 시각 + 갱신 주기)
  const fxTime = isExample ? "" : " (" + formatRelativeTime(meta.fxMeta.fetched_at) + " 갱신)";
  $("#fx-line").textContent = "오늘 1$ " + formatRate(result.usdKrw) + fxTime;
  $("#data-time").textContent = isExample
    ? "예시 데이터"
    : "시세 " + formatRelativeTime(meta.coinMeta.fetched_at);

  renderAnswerCard(result);

  // 시뮬레이터: 선택된 코인이 실제로 고른 코인에 있는지, 기본값 채우고 결과 갱신
  const coinSel = $("#sim-coin");
  coinSel.innerHTML = "";
  for (const row of result.rows) {
    const opt = document.createElement("option");
    opt.value = row.id;
    opt.textContent = coinName(row.id);
    coinSel.appendChild(opt);
  }
  if (![...coinSel.options].some((o) => o.selected)) coinSel.selectedIndex = 0;
  simDefaults(result);
  renderSimResult(result);

  renderCoinList(result);

  const terms = [meta.coinMeta.terms, meta.fxMeta.terms].filter(Boolean).join(", ");
  $("#source-line").textContent =
    "출처: CoinGecko, Rates By Exchange Rate API" + (terms ? " (" + terms + ")" : "") + " · 24시간 환율은 하루 1회 갱신";

  // 접힌 구역: 24시간 흐름 차트 + 시뮬레이터
  renderFlowCharts(result);
  // 접힌 구역: 원화·비트코인·환율·통합 차트
  renderAllCharts(result);
}

export function renderError(message, statusText) {
  $("#app-status").textContent = statusText;
  $("#coin-list").textContent = "";
  $("#fx-line").textContent = message;
  $("#data-time").textContent = "";
  $("#source-line").textContent = "";
  $("#sim-result").textContent = "";
  $("#answer-num").className = "ds-answer-num ds-flat";
  $("#answer-num").textContent = "—";
  $("#answer-usd").textContent = "—";
  $("#answer-fx").textContent = "—";
  $("#answer-rate").textContent = "—";
}

export function bindExample(onExample) {
  $("#app-status").textContent = onExample ? "예시 데이터입니다" : "";
  $("#example-button").textContent = onExample ? "실데이터로 돌아가기" : "예시로 해 보기";
}
