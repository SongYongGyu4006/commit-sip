// 대시보드를 매번 처음부터 다시 그린다(누적 상태 없음, li 중복 없음)
// 구조: 띠(오늘 1$ · 데이터 기준) → 답 카드(24시간 수익) → 시세 차트 3개(원화·비트코인·통합) → 코인 시세 → 그때 샀더라면 → 안내 → 출처
import { formatWon, formatRate, formatSigned, coinName, formatSeoulClock, barWidth } from "./format.js";
import { round2 } from "./app.js";
import { renderAllCharts } from "./chart.js";
import { simDefaults, renderSimResult, simCoinChange } from "./simulator.js";

const $ = (sel) => document.querySelector(sel);
const hueOf = (name) => [...name].reduce((s, c) => s + c.codePointAt(0), 0) % 8;
const dirClass = (dir) => (dir === "up" ? "ds-up" : dir === "down" ? "ds-down" : "ds-flat");

// 환율 효과: 데이터의 fxEffectPct를 그대로 쓴다(24시간 원화 변동 − 24시간 달러 변동).
function fxEffectPct(r) {
  return r.fxEffectPct;
}

// 보유 코인 한 단위(가격 기준) 1백만 원어치로 24시간 원화 실질 변동을 "원" 단위로 계산:
// 각 코인 1백만 원어치 = 1,000,000 / krwPrice 개 → 24시간 변동 = (1,000,000 / krwPrice) × krwChangePct/100 × krwPrice = 1,000,000 × krwChangePct/100
// → 코인 1백만 원어치당 변동 = krwChangePct% × 10,000원. 총합은 각 코인 1백만 원어치 합.
function wonDelta(result) {
  return result.rows.reduce((s, r) => s + 10000 * r.krwChangePct, 0);
}

// 24시간 원화 실질 변동을 "원" 금액으로 풀어 쓴 답 카드
function renderAnswerCard(result) {
  const delta = wonDelta(result);
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const num = $("#answer-num");
  num.className = "ds-answer-num " + dirClass(dir);
  num.textContent = sign + formatWon(Math.abs(delta));
  const small = document.createElement("small");
  small.textContent = "원";
  num.appendChild(small);

  // 한 문장: 1백만 원어치로 풀어 쓴다
  $("#answer-text").textContent =
    "1백만 원어치 들고 있었다면 24시간 동안 " + sign + formatWon(Math.abs(delta)) + "원" +
    (dir === "up" ? " 더 늘었어요" : dir === "down" ? " 줄었어요" : " 변화가 없어요") +
    ". 원화 변동은 달러 변동과 환율 효과의 합이에요.";

  // 보조 숫자: 오늘 1$ 환율 + 24시간 달러 변동(원화 기준) + 24시간 환율 효과(원화 기준)
  const rows = result.rows;
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
// "24시간 원화 +0.37% (달러 +0.37% · 환율 0%)" 처럼 쉬운 한 문장으로.
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
    const delta = Math.round((row.krwPrice * row.krwChangePct) / 100);
    realAmount.textContent = "24시간 " + (delta > 0 ? "+" : delta < 0 ? "−" : "") + formatWon(Math.abs(delta)) + "원";
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
  // 띠: 오늘 1$ 환율 + 데이터 기준(서울 시각)
  $("#fx-line").textContent = "오늘 1$ = " + formatRate(result.usdKrw);
  $("#data-time").textContent = "데이터 기준: " + formatSeoulClock(meta.coinMeta.fetched_at);
  $("#band-sub").textContent = isExample ? "예시 데이터" : "보유 코인 기준 · 1백만 원어치로 계산";

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

  // 24시간 원화 변동 차트(달러 변동 · 환율 효과 · 원화 실질 변동 — 한 축)
  renderAllCharts(result);
}

export function renderError(message, statusText) {
  $("#app-status").textContent = statusText;
  $("#coin-list").textContent = "";
  $("#fx-line").textContent = "오늘 1$ = —원";
  $("#data-time").textContent = "데이터 기준: —";
  $("#band-sub").textContent = message;
  $("#source-line").textContent = "";
  $("#sim-result").textContent = "";
  $("#answer-num").className = "ds-answer-num ds-flat";
  $("#answer-num").textContent = "—";
  $("#answer-text").textContent = "시세를 불러오지 못했어요";
  $("#answer-usd").textContent = "—";
  $("#answer-fx").textContent = "—";
  $("#answer-rate").textContent = "—";
}

export function bindExample(onExample) {
  $("#app-status").textContent = onExample ? "예시 데이터입니다" : "";
  $("#example-button").textContent = onExample ? "실데이터로 돌아가기" : "예시로 해 보기";
}
