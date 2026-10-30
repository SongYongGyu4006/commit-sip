// 24시간 변동 비교 차트: 코인별 원화·달러·환율 막대를 그린다(순수 계산 + 렌더)
import { formatSigned, formatRate, coinName } from "./format.js";
import { round2 } from "./app.js";

// canvas id + Chart.js 옵션으로 차트를 그린다. 재호출 시 기존 차트를 깨고 새로 만든다(누적 방지).
// 전역 Chart(Chart.js UMD)가 없으면 조용히 건너뛴다.
export function drawChart(canvasId, { data, options }) {
  const C = (typeof window !== "undefined" && window.Chart) || null;
  if (!C || typeof Chart !== "function") return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  try {
    const old = Chart.getChart(canvas);
    if (old) old.destroy();
  } catch {
    /* 무시 */
  }
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => (css.getPropertyValue(n) || "").trim() || fb;
  new Chart(canvas, {
    type: "bar",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: tok("--ds-ink-2", "#454d5e") } }, ...(options || {}).plugins },
      scales: {
        x: { grid: { color: tok("--ds-line", "#e1e4ea") }, ticks: { color: tok("--ds-ink-3", "#5f6777") } },
        y: { grid: { display: false }, ticks: { color: tok("--ds-ink", "#151a24") } },
        ...(options || {}).scales,
      },
    },
  });
}

// 좌축: 가격/환율, 우축: 24시간 변동 % — 두 축을 함께 보여주는 차트.
const DUAL_SCALES = {
  x: { stacked: true },
  y: { type: "linear", position: "left", title: { display: true } },
  y1: {
    type: "linear",
    position: "right",
    grid: { drawOnChartArea: false },
    ticks: { callback: (v) => v + "%" },
  },
};

// 원화 시세: 코인별 원화 가격(좌축) + 24시간 원화 실질 변동(우축)
export function krwChartData(rows) {
  return {
    labels: rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "원화 가격", data: rows.map((r) => r.krwPrice), yAxisID: "y", backgroundColor: "var(--ds-c1)" },
      { label: "24시간 원화 실질", data: rows.map((r) => r.krwChangePct), yAxisID: "y1" },
    ],
  };
}

// 비트코인 시세: 달러 가격(좌축) + 24시간 변동(우축, 원화 실질 포함)
export function btcChartData(rows) {
  return {
    labels: rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "달러 가격", data: rows.map((r) => r.usdPrice), yAxisID: "y", backgroundColor: "var(--ds-c2)" },
      { label: "24시간 달러", data: rows.map((r) => r.usdChangePct), yAxisID: "y1" },
      { label: "24시간 원화 실질", data: rows.map((r) => r.krwChangePct), yAxisID: "y1" },
    ],
  };
}

// 환율: 오늘 1$ 환율(좌축) + 코인별 환율 효과(우축)
export function fxChartData(result) {
  return {
    labels: result.rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "오늘 1$ 환율", data: result.rows.map(() => result.usdKrw), yAxisID: "y", backgroundColor: "var(--ds-c3)" },
      { label: "환율 효과", data: result.rows.map((r) => r.fxEffectPct), yAxisID: "y1" },
    ],
  };
}

// 통합: 원화 가격 · 달러 가격(좌축, 스택) + 환율(우축)
export function unifiedChartData(result) {
  return {
    labels: result.rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "원화 가격", data: result.rows.map((r) => r.krwPrice), yAxisID: "y" },
      { label: "달러 가격", data: result.rows.map((r) => r.usdPrice), yAxisID: "y" },
      { label: "환율", data: result.rows.map(() => result.usdKrw), yAxisID: "y1" },
    ],
  };
}

// 24시간 흐름(접힌 구역): 24시간 전·지금의 원화 가격(좌축, 스택) + 24시간 전·지금 환율(우축).
// 24시간 전 환율은 데이터에 없어 null(데이터 없음)로 둔다.
export function flowChartData(result) {
  return {
    labels: result.rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "24시간 전 원화", data: result.rows.map((r) => Math.round(r.krwPrice / (1 + r.krwChangePct / 100))), yAxisID: "y" },
      { label: "지금 원화", data: result.rows.map((r) => r.krwPrice), yAxisID: "y" },
      { label: "24시간 전 환율", data: result.rows.map(() => null), yAxisID: "y1" },
      { label: "지금 환율", data: result.rows.map(() => result.usdKrw), yAxisID: "y1" },
    ],
  };
}

// 접힌 구역: 24시간 흐름 차트를 다시 그린다(시뮬레이터는 renderDashboard가 채운다).
export function renderFlowCharts(result) {
  drawChart("flow-chart", {
    data: flowChartData(result),
    options: {
      indexAxis: "y",
      scales: {
        ...DUAL_SCALES,
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: "원화 가격(원)" } },
        y1: { ...DUAL_SCALES.y1, title: { display: true, text: "1$(원)" } },
      },
      plugins: {
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " " + (ctx.parsed.y !== null ? (ctx.datasetIndex < 2 ? "₩" + ctx.parsed.y.toLocaleString() : formatRate(ctx.parsed.y)) : "데이터 없음") } },
      },
    },
  });
}

// 첫 화면에 바로 보이는 4개 차트를 함께 그린다.
export function renderAllCharts(result) {
  const rows = result.rows;
  drawChart("krw-price-chart", {
    data: krwChartData(rows),
    options: {
      indexAxis: "y",
      scales: { ...DUAL_SCALES, x: { stacked: false }, y: { title: { display: true, text: "원화 가격(원)" } } },
      plugins: {
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " " + (ctx.datasetIndex ? formatSigned(ctx.parsed.x) + "%" : "₩" + ctx.parsed.y.toLocaleString()) } },
      },
    },
  });
  drawChart("btc-chart", {
    data: btcChartData(rows),
    options: {
      indexAxis: "y",
      scales: { ...DUAL_SCALES, x: { stacked: false }, y: { title: { display: true, text: "달러 가격($)" } } },
      plugins: {
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " " + (ctx.datasetIndex ? formatSigned(ctx.parsed.x) + "%" : "$" + ctx.parsed.y.toLocaleString()) } },
      },
    },
  });
  drawChart("fx-chart", {
    data: fxChartData(result),
    options: {
      indexAxis: "y",
      scales: { ...DUAL_SCALES, x: { stacked: false }, y: { title: { display: true, text: "1$(원)" } } },
      plugins: {
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " " + (ctx.datasetIndex ? formatSigned(ctx.parsed.x) + "%" : formatRate(ctx.parsed.y)) } },
      },
    },
  });
  drawChart("unified-chart", {
    data: unifiedChartData(result),
    options: {
      indexAxis: "y",
      scales: {
        ...DUAL_SCALES,
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: "가격(원·$)" } },
        y1: { ...DUAL_SCALES.y1, title: { display: true, text: "1$(원)" } },
      },
      plugins: {
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " " + (ctx.parsed.y !== null ? (ctx.datasetIndex < 2 ? "₩$" + ctx.parsed.y.toLocaleString() : formatRate(ctx.parsed.y)) : "데이터 없음") } },
      },
    },
  });
}

// 시뮬레이터: 매수 시점(원화 투자금·달러 가격·환율)과 현재가 → {currentKrw, profitKrw, pct, direction, valid}
export function simulate(amountKrw, buyUsd, buyFx, nowUsd, nowFx) {
  const amount = Number(amountKrw);
  const usd = Number(buyUsd);
  const fx = Number(buyFx);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(usd) || usd <= 0 || !Number.isFinite(fx) || fx <= 0) {
    return { valid: false };
  }
  const quantity = amount / (usd * fx);
  const currentKrw = quantity * Number(nowUsd) * Number(nowFx);
  const profitKrw = currentKrw - amount;
  const pct = round2((profitKrw / amount) * 100);
  return {
    valid: true,
    currentKrw,
    profitKrw,
    pct,
    direction: profitKrw > 0 ? "up" : profitKrw < 0 ? "down" : "flat",
  };
}

// ds-up(빨강)·ds-down(파랑)·ds-flat(회색) 클래스
export function simDirectionClass(p) {
  return p > 0 ? "ds-up" : p < 0 ? "ds-down" : "ds-flat";
}
