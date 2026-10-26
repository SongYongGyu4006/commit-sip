// 대시보드를 매번 처음부터 다시 그린다(누적 상태 없음, li 중복 없음)
import { formatWon, formatRate, formatSigned, coinName, formatSeoulTime, barWidth } from "./format.js";
import { renderAllCharts, renderFlowCharts } from "./chart.js";
import { simDefaults, renderSimResult, simCoinChange } from "./simulator.js";

const $ = (sel) => document.querySelector(sel);
const hueOf = (name) => [...name].reduce((s, c) => s + c.codePointAt(0), 0) % 8;

export function renderDashboard({ usdKrw, rows }, meta, isExample) {
  $("#fx-line").textContent = "오늘 1$ = " + formatRate(usdKrw) + "원";
  $("#data-time").textContent = isExample ? "예시 데이터" : "데이터 기준: " + formatSeoulTime(meta.coinMeta.fetched_at);

  // 시뮬레이터: 선택된 코인이 실제로 고른 코인에 있는지, 기본값 채우고 결과 갱신
  const coinSel = $("#sim-coin");
  coinSel.innerHTML = "";
  for (const row of rows) {
    const opt = document.createElement("option");
    opt.value = row.id;
    opt.textContent = coinName(row.id);
    coinSel.appendChild(opt);
  }
  if (![...coinSel.options].some((o) => o.selected)) coinSel.selectedIndex = 0;
  simDefaults({ usdKrw, rows });
  renderSimResult({ usdKrw, rows });

  // 코인 목록: ds-list 구조(아바타·이름·보조 정보·오른쪽 금액)
  const list = $("#coin-list");
  list.textContent = "";
  for (const row of rows) {
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
    real.textContent = "원화 실질 " + formatSigned(row.krwChangePct) + "%";
    titleRow.append(title, real);

    const sub = document.createElement("span");
    sub.className = "ds-list-sub";
    const usd = document.createElement("span");
    usd.className = "usd-change";
    usd.textContent = "달러 " + formatSigned(row.usdChangePct) + "%";
    const fx = document.createElement("span");
    fx.className = "fx-effect";
    fx.textContent = "환율 효과 " + formatSigned(row.fxEffectPct) + "%p";
    sub.append(usd, fx);

    main.append(titleRow, sub);

    const end = document.createElement("div");
    end.className = "ds-list-end";
    const price = document.createElement("span");
    price.className = "krw-price ds-list-amount";
    price.textContent = "₩" + formatWon(row.krwPrice);
    end.appendChild(price);

    const barWrap = document.createElement("div");
    barWrap.className = "bar-wrap";
    const bar = document.createElement("div");
    bar.className = "real-bar " + dir;
    bar.style.width = barWidth(row.krwChangePct) + "%";
    barWrap.appendChild(bar);

    li.append(avatar, main, end, barWrap);
    list.appendChild(li);
  }

  const terms = [meta.coinMeta.terms, meta.fxMeta.terms].filter(Boolean).join(", ");
  $("#source-line").textContent = "출처: CoinGecko, Rates By Exchange Rate API" + (terms ? " (" + terms + ")" : "");

  // 원화·비트코인·환율·통합 차트도 같은 흐름으로 다시 그린다
  renderAllCharts({ usdKrw, rows });

  // 접힌 구역: 24시간 흐름 차트·시뮬레이터
  renderFlowCharts({ usdKrw, rows });
}

// 시뮬레이터 입력(코인·투자금·매수 가격·환율)을 대시보드와 연결한다. 한 번만.
let simBound = false;
export function bindSim(result) {
  if (simBound) return;
  simBound = true;
  for (const id of ["sim-amount", "sim-buy-usd", "sim-buy-fx"]) {
    $("#" + id).addEventListener("input", () => renderSimResult(result));
  }
  $("#sim-coin").addEventListener("change", () => simCoinChange(result));
}

export function renderError(message, statusText) {
  $("#app-status").textContent = statusText;
  $("#coin-list").textContent = "";
  $("#fx-line").textContent = message;
  $("#data-time").textContent = "";
  $("#source-line").textContent = "";
  $("#sim-result").textContent = "";
}

export function bindExample(onExample) {
  $("#app-status").textContent = onExample ? "예시 데이터입니다" : "";
  $("#example-button").textContent = onExample ? "실데이터로 돌아가기" : "예시로 해 보기";
}
