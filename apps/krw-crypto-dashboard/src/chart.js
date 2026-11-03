// 24시간 변동 차트: 코인별 "달러 변동"·"환율 효과"·"원화 실질 변동" 세 막대를 한 축(%)에 그린다.
import { formatSigned, coinName, formatWon } from "./format.js";
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

// 원화 시세: 코인별 "달러 변동" + "환율 효과" + "원화 실질 변동" — 세 막대 모두 같은 축(%)에 둔다.
// 이중축(가격+%)은 없앤다: 24시간 변동만 하나의 % 축으로 읽기 쉽게.
// 환율 효과 = row.fxEffectPct(24시간 원화 변동 − 24시간 달러 변동, 환율 데이터가 하루치라 0).
export function krwChartData(rows) {
  return {
    labels: rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "달러 변동", data: rows.map((r) => r.usdChangePct), backgroundColor: "var(--ds-c2)" },
      { label: "환율 효과", data: rows.map((r) => r.fxEffectPct), backgroundColor: "var(--ds-c3)" },
      { label: "원화 실질 변동", data: rows.map((r) => r.krwChangePct), backgroundColor: "var(--ds-c1)" },
    ],
  };
}

// 비트코인 시세: 현재 가격(원) + 24시간 전 가격(원)을 막대로 보여 준다.
// 24시간 전 가격 = 현재 ÷ (1 + 24시간 원화 변동/100). 환율 데이터가 하루 1회라 환율 효과는 반영 안 됨.
export function btcChartData(rows) {
  const b = rows.find((r) => r.id === "bitcoin") || rows[0];
  const current = b.krwPrice;
  const prev = Math.round(current / (1 + (b.krwChangePct / 100)));
  return {
    labels: [coinName(b.id)],
    datasets: [
      { label: "24시간 전", data: [prev], backgroundColor: "var(--ds-c2)" },
      { label: "현재", data: [current], backgroundColor: "var(--ds-c1)" },
    ],
  };
}

// 원화·비트코인 반영 통합: 24시간 원화 변동(%)과 원화 금액 변동(원)을 같은 차트에.
// 가격 레벨은 답 카드·목록에서 이미 보이기 때문에, 여기엔 변동 정보만.
export function integratedChartData(rows) {
  return {
    labels: rows.map((r) => coinName(r.id)),
    datasets: [
      { label: "24시간 변동(%)", data: rows.map((r) => r.krwChangePct), backgroundColor: "var(--ds-c1)", yAxisID: "y" },
      { label: "24시간 원화 변동(원)", data: rows.map((r) => Math.round((r.krwPrice * r.krwChangePct) / 100)), backgroundColor: "var(--ds-c4)", yAxisID: "y1" },
    ],
  };
}

// 첫 화면에 바로 보이는 3개 차트(원화 시세 / 비트코인 시세 / 통합)를 그린다.
export function renderAllCharts(result) {
  const rows = result.rows;
  drawChart("krw-price-chart", {
    data: krwChartData(rows),
    options: {
      indexAxis: "y",
      scales: {
        x: { stacked: false, title: { display: true, text: "24시간 변동(%)" }, grid: { color: "var(--ds-line)" }, ticks: { callback: (v) => v + "%" } },
        y: { stacked: false, grid: { display: false } },
      },
      plugins: {
        legend: { display: true, labels: { color: "var(--ds-ink-2)" } },
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " " + formatSigned(ctx.parsed.x) + "%" } },
      },
    },
  });
  drawChart("btc-price-chart", {
    data: btcChartData(rows),
    options: {
      scales: {
        x: { grid: { display: false } },
        y: { grid: { display: false }, title: { display: true, text: "원" }, ticks: { callback: (v) => formatWon(v) } },
      },
      plugins: {
        legend: { display: true, labels: { color: "var(--ds-ink-2)" } },
        tooltip: { callbacks: { label: (ctx) => " " + ctx.dataset.label + " ₩" + formatWon(ctx.parsed.y) } },
      },
    },
  });
  drawChart("integrated-chart", {
    data: integratedChartData(rows),
    options: {
      scales: {
        x: { stacked: false, grid: { display: false } },
        y: { position: "left", grid: { display: false }, title: { display: true, text: "24시간 변동(%)" }, ticks: { callback: (v) => v + "%" } },
        y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "원화 변동(원)" }, ticks: { callback: (v) => formatWon(v) } },
      },
      plugins: {
        legend: { display: true, labels: { color: "var(--ds-ink-2)" } },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ctx.dataset.yAxisID === "y1"
                ? " " + ctx.dataset.label + " " + (ctx.parsed.y > 0 ? "+" : ctx.parsed.y < 0 ? "−" : "") + formatWon(Math.abs(ctx.parsed.y)) + "원"
                : " " + ctx.dataset.label + " " + formatSigned(ctx.parsed.y) + "%",
          },
        },
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
