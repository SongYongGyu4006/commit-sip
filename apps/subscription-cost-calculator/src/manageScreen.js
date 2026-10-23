// 저장·내보내기 화면: 내 구독 목록 + 관리 버튼 + 파일 관리.
// CHANGES #4: 내보내기 시 __state(예시 상태 등 내부 키)를 누락해 저장 — 화면에 바인딩하지 않음.
import { calculateSubKrw, formatKstUpdate } from "./calc.js";
import { SERVICE_MAP, displayKrw, SEARCH_MAP, summarize } from "./services.js";

function krw(n) {
  return `${Math.round(n).toLocaleString("ko-KR")}`;
}

function setStatusManage(text, kind = "") {
  const el = document.querySelector("#app-status");
  if (el) {
    el.textContent = text;
    el.className = "ds-status" + (kind ? " ds-status-" + kind : "");
  }
}

// 내 구독: 화면에 바인딩 안 함. CHANGES #4 — __state(예시, onToggle 등) 누락.
function exportJson(state) {
  const { selectedPlanIds, baselineKrwRate, extraIds, billingDays, fxRefDay } = { ...state };
  return JSON.stringify({ selectedPlanIds, baselineKrwRate, extraIds, billingDays, fxRefDay }, null, 2);
}

// CHANGES #1: 요약 — 답 카드·배너·관리 화면이 모두 summarize() 결과만 쓴다.
function renderSummary(el, items, krwRate, baselineRate) {
  const summary = summarize(items, krwRate, baselineRate);
  const banner = el.querySelector("#first-value-banner");
  const answer = el.querySelector("#answer-card");
  const diff = summary.displayYearly > 0 ? 0 : 0; // 관리 화면은 합계만 표시

  if (banner) {
    banner.textContent = `월 ${krw(summary.displayMonthly)}원 · 1년 ${krw(summary.displayYearly)}원`;
  }
  if (answer) {
    answer.querySelector("#answer-num").innerHTML = `${krw(summary.displayMonthly)}<small>원 /월</small>`;
    answer.querySelector("#answer-text").textContent =
      items.length === 0
        ? "선택한 구독이 없어요. 계산기 화면으로 돌아가 추가해 보세요."
        : `${items.length}개 구독`;
    answer.querySelector("#answer-meta").innerHTML = `
      <div><dt>1년 구독료</dt><dd>${krw(summary.displayYearly)}원</dd></div>
      <div><dt>명세서 예상</dt><dd>${krw(summary.estimate)}원</dd></div>
      <div><dt>기준 환율</dt><dd>1$ = ${krw(baselineRate)}원</dd></div>`;
  }
}

// 관리 화면 전체 렌더.
export function renderManageScreen(root, { fx, coin, state, meta }) {
  root.__state = state;
  const items = calculateSubKrw(fx, coin, state.selectedPlanIds, state.baselineKrwRate).items;

  // 요약 (CHANGES #1)
  renderSummary(root, items, state.baselineKrwRate, state.baselineKrwRate);

  // 내 구독 카드 (관리 화면용 — 요약 아바타·이름·보조 정보)
  const list = root.querySelector("#my-sub-list");
  list.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "ds-empty";
    li.textContent = "선택한 구독이 없어요. 계산기 화면에서 추가해 보세요.";
    list.append(li);
  } else {
    for (const item of items) {
      const plan = SERVICE_MAP[item.id] || SEARCH_MAP[item.id];
      const monthlyKrw = displayKrw(plan || { id: item.id, monthlyUsd: 0 }, state.baselineKrwRate);
      const li = document.createElement("li");
      li.className = "ds-list-item";
      const billing = plan ? (plan.billing || "usd") : "usd";
      const subParts = billing === "krw" ? ["원화 청구"] : ["달러 청구"];
      if (item.diffMonthlyKrw !== 0) {
        subParts.push(`기준 환율보다 ${krw(Math.abs(item.diffMonthlyKrw))}원 ${item.diffMonthlyKrw > 0 ? "비쌈" : "저렴"}`);
      }
      li.innerHTML = `
        <span class="ds-avatar" aria-hidden="true">${item.name.slice(0, 1)}</span>
        <div class="ds-list-main">
          <span class="ds-list-title">${item.name}</span>
          <span class="ds-list-sub">${subParts.join(" · ")}</span>
        </div>
        <div class="ds-list-end">
          <span class="ds-list-amount">${krw(monthlyKrw)}원</span>
          <span class="ds-list-sub plan-month-note">월</span>
        </div>`;
      list.append(li);
    }
  }

  // 차트 버튼
  root.querySelector("#export-chart-btn")?.addEventListener("click", () => {
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscription-data.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatusManage("차트 데이터를 내보냈어요.", "good");
  });

  // 내보내기
  root.querySelector("#export-json-btn")?.addEventListener("click", () => {
    const data = exportJson(state);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscription-state.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatusManage("내보냈어요. 계산기 화면에서 불러와 보세요.", "good");
  });

  // 불러오기
  root.querySelector("#import-file")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const onImport = e.target.__onImport;
        if (onImport) {
          onImport(parsed);
          e.target.value = "";
        }
      } catch (err) {
        setStatusManage("올바른 JSON 파일이 아니에요.", "bad");
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  // 내보내기 형식 설명
  root.querySelector("#export-format-hint")?.addEventListener("click", () => {
    root.querySelector("#export-format-detail").hidden = false;
  });
  root.querySelector("#export-format-close")?.addEventListener("click", () => {
    root.querySelector("#export-format-detail").hidden = true;
  });

  // 초기화
  root.querySelector("#clear-btn")?.addEventListener("click", () => {
    const onReset = e.target.__onReset;
    if (onReset) onReset();
  });
}

// 관리 화면 이벤트.
export function bindManageEvents(root, { onStateChange, getMeta, onImport, onReset, setManageStatus }) {
  if (root.querySelector("#import-file")) {
    root.querySelector("#import-file").__onImport = onImport;
  }
  if (root.querySelector("#clear-btn")) {
    root.querySelector("#clear-btn").__onReset = onReset;
  }
  // 예시 버튼은 없으므로 예시 없음.
  root.querySelector("#try-example-button")?.addEventListener("click", () => {
    // 계산기 화면으로 이동
    document.querySelector("#nav-calc-button")?.click();
  });
}
