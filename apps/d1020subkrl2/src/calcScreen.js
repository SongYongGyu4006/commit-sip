// 계산기 화면 렌더링과 이벤트 연결. 모든 렌더링은 textContent 로 한다.
import { PLAN_CATALOG, formatKstUpdate } from "./calc.js";

const fmt = (n) => "₩" + n.toLocaleString("ko-KR");

export function renderCalcScreen(result, state) {
  document.querySelector("#fx-header").textContent =
    `1$ = ₩${result.krwRate.toLocaleString("ko-KR")} (한국 시간 갱신: ${formatKstUpdate(result.updatedAtUtc)})`;
  const diff = result.totalDiffMonthlyKrw;
  const diffText = diff === 0 ? "₩0 (변동 없음)" : `${diff > 0 ? "+" : "-"}₩${Math.abs(diff).toLocaleString("ko-KR")}원`;
  document.querySelector("#first-value-banner").textContent =
    `오늘 환율 기준 월 ₩${result.totalMonthlyKrw.toLocaleString("ko-KR")}원, 기준 환율 대비 ${diffText}`;

  for (const plan of Object.values(PLAN_CATALOG)) {
    const box = document.querySelector(`#plan-${plan.id}`);
    if (box) box.checked = state.selectedPlanIds.includes(plan.id);
  }
  const input = document.querySelector("#baseline-rate-input");
  if (document.activeElement !== input) input.value = String(state.baselineKrwRate);

  const list = document.querySelector("#selected-plan-list");
  list.replaceChildren();
  const zeroBanner = result.items.length > 0 && result.items.every((item) => item.diffMonthlyKrw === 0);
  if (zeroBanner) {
    const li = document.createElement("li");
    li.className = "plan-empty";
    li.textContent = `기준 환율(${result.baselineRate.toLocaleString("ko-KR")})과 오늘 환율이 같아 변동액이 0원입니다. 기준 환율을 바꾸면 올랐는지 내렸는지 볼 수 있습니다.`;
    list.appendChild(li);
  }
  if (result.items.length === 0 && !zeroBanner) {
    const li = document.createElement("li");
    li.className = "plan-empty";
    li.textContent = "선택한 요금제가 없습니다. 아래에서 요금제를 골라 주세요.";
    list.appendChild(li);
  }
  for (const item of result.items) {
    const li = document.createElement("li");
    li.className = "plan-item";
    const name = document.createElement("span");
    name.className = "plan-name";
    name.textContent = item.name;
    const monthly = document.createElement("span");
    monthly.textContent = `월 ${fmt(item.monthlyKrw)}`;
    const yearly = document.createElement("span");
    yearly.textContent = `연 ${fmt(item.yearlyKrw)}`;
    const diff = document.createElement("span");
    const abs = Math.abs(item.diffMonthlyKrw).toLocaleString("ko-KR");
    diff.textContent = item.diffMonthlyKrw > 0 ? `+₩${abs}` : item.diffMonthlyKrw < 0 ? `-₩${abs}` : "₩0 (변동 없음)";
    diff.className = item.diffMonthlyKrw > 0 ? "diff-up" : item.diffMonthlyKrw < 0 ? "diff-down" : "diff-even";
    li.append(name, monthly, yearly, diff);
    list.appendChild(li);
  }

  document.querySelector("#btc-summary").textContent =
    `1BTC = ₩${result.coins.bitcoin.krw.toLocaleString("ko-KR")} (${result.coins.bitcoin.changeText})`;
  document.querySelector("#eth-summary").textContent =
    `1ETH = ₩${result.coins.ethereum.krw.toLocaleString("ko-KR")} (${result.coins.ethereum.changeText})`;
}

export function bindCalcEvents(onStateChange) {
  for (const plan of Object.values(PLAN_CATALOG)) {
    document.querySelector(`#plan-${plan.id}`).addEventListener("change", () => {
      const selected = [...document.querySelectorAll("input.plan-checkbox:checked")].map((box) => box.value);
      onStateChange({ selectedPlanIds: selected, baselineKrwRate: readBaseline() });
    });
  }
  document.querySelector("#baseline-rate-input").addEventListener("input", () => {
    onStateChange({
      selectedPlanIds: [...document.querySelectorAll("input.plan-checkbox:checked")].map((box) => box.value),
      baselineKrwRate: readBaseline(),
    });
  });
}

// 입력값을 있는 그대로 넘긴다. 유효하지 않은 값(0, 음수, 공백 등)을 조용히
// 기본값으로 바꾸지 않아 계산 오류가 상태 영역에 그대로 알려지게 한다.
function readBaseline() {
  return Number(document.querySelector("#baseline-rate-input").value);
}
