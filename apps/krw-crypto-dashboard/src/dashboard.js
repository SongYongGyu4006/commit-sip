// 대시보드를 매번 처음부터 다시 그린다(누적 상태 없음, li 중복 없음)
import { formatWon, formatRate, formatSigned, coinName, formatSeoulTime, barWidth } from "./format.js";

const $ = (sel) => document.querySelector(sel);

export function renderDashboard({ usdKrw, rows }, meta, isExample) {
  $("#fx-line").textContent = "오늘 1$ = " + formatRate(usdKrw) + "원";
  $("#data-time").textContent = isExample ? "예시 데이터" : "데이터 기준: " + formatSeoulTime(meta.coinMeta.fetched_at);
  const list = $("#coin-list");
  list.textContent = "";
  for (const row of rows) {
    const li = document.createElement("li");
    li.className = "coin-row";
    li.dataset.id = row.id;

    const name = document.createElement("span");
    name.className = "coin-name";
    name.textContent = coinName(row.id);

    const price = document.createElement("span");
    price.className = "krw-price";
    price.textContent = "₩" + formatWon(row.krwPrice);

    const usd = document.createElement("span");
    usd.className = "usd-change";
    usd.textContent = "달러 " + formatSigned(row.usdChangePct) + "%";

    const fx = document.createElement("span");
    fx.className = "fx-effect";
    fx.textContent = "환율 효과 " + formatSigned(row.fxEffectPct) + "%p";

    const real = document.createElement("span");
    real.className = "real-change " + row.direction;
    real.textContent = "원화 실질 " + formatSigned(row.krwChangePct) + "%";

    const barWrap = document.createElement("div");
    barWrap.className = "bar-wrap";
    const bar = document.createElement("div");
    bar.className = "real-bar " + row.direction;
    bar.style.width = barWidth(row.krwChangePct) + "%";
    barWrap.appendChild(bar);

    li.append(name, price, usd, fx, real, barWrap);
    list.appendChild(li);
  }
  const terms = [meta.coinMeta.terms, meta.fxMeta.terms].filter(Boolean).join(", ");
  $("#source-line").textContent = "출처: CoinGecko, Rates By Exchange Rate API" + (terms ? " (" + terms + ")" : "");
}

export function renderError(message, statusText) {
  $("#app-status").textContent = statusText;
  $("#coin-list").textContent = "";
  $("#fx-line").textContent = message;
  $("#data-time").textContent = "";
  $("#source-line").textContent = "";
}

export function bindExample(onExample) {
  $("#app-status").textContent = onExample ? "예시 데이터입니다" : "";
}
