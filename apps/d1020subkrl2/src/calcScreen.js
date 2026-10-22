// 계산기 화면: 체크박스 6종 · 기준 환율 입력 · 요약 배너 · 선택 목록 · 코인 요약.
// CHANGES #1(2단 목록) #2(청구 통화) #3(명세서 예상액) #4(쉬운 말) #5(계산식 펼치기) 를 여기서 처리한다.
import { calculateSubKrw, PLAN_CATALOG, DEFAULT_STATE, formatKstUpdate } from "./calc.js";
import { SERVICE_MAP, ESTIMATE_TAX, ESTIMATE_FEE, estimateBill, estimateForRow, baselineKrwFor } from "./services.js";

function krw(n) {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function hueForName(name) {
  let h = 0;
  for (const c of name) h = (h + c.codePointAt(0)) % 8;
  return h;
}

function diffText(diff) {
  if (diff > 0) return `최근 기준 환율보다 ${Math.abs(diff).toLocaleString("ko-KR")}원 더 내요`;
  if (diff < 0) return `최근 기준 환율보다 ${Math.abs(diff).toLocaleString("ko-KR")}원 덜 내요`;
  return "기준 환율과 같아 달라진 게 없어요";
}

// 한 줄(2단): 윗줄(아바타·이름·월액) + 아랫줄(표시 가격 → 명세서 예상액 + 차이 배지 + 결제일 접힘).
function renderPlanRow(item, plan, baselineRate, isExample) {
  const s = SERVICE_MAP[plan.id];
  const billing = s.billing;
  const monthlyKrw = billing === "krw" ? s.monthlyKrw : item.monthlyKrw;
  const estimate = estimateForRow(monthlyKrw, billing);
  const diff = estimate - monthlyKrw;
  const baseKrw = billing === "krw" ? s.monthlyKrw : baselineKrwFor(plan.monthlyUsd, baselineRate);
  const diffVsBase = monthlyKrw - baseKrw;

  const li = document.createElement("li");
  li.className = "ds-list-item";
  li.innerHTML = `
    <span class="ds-avatar" data-hue="${hueForName(plan.name)}" aria-hidden="true">${plan.name.slice(0, 1)}</span>
    <div class="ds-list-main">
      <div class="plan-top">
        <input type="checkbox" class="plan-checkbox" id="plan-${plan.id}" ${item ? "checked" : ""} aria-label="${plan.name}"/>
        <span class="ds-list-title">${plan.name}</span>
        <span class="ds-list-amount">${krw(monthlyKrw)}<small> /월</small></span>
        ${billing === "krw" ? '<span class="ds-badge ds-badge-accent">원화 청구</span>' : '<span class="ds-badge">달러 청구</span>'}
        <button type="button" class="plan-remove" data-remove="${plan.id}" aria-label="${plan.name} 제외">제외</button>
      </div>
      <div class="plan-bottom">
        <span class="plan-est">표시 ${krw(monthlyKrw)} → 명세서 약 ${krw(estimate)} ${diff > 0 ? `<span class="ds-badge ${diffVsBase > 0 ? "ds-badge-warn" : "ds-badge-good"}">${krw(diff)}</span>` : ""}</span>
        <span class="plan-diff ${diffVsBase > 0 ? "ds-up" : diffVsBase < 0 ? "ds-down" : "ds-flat"}">${diffVsBase > 0 ? "+" : diffVsBase < 0 ? "−" : ""}${krw(Math.abs(diffVsBase))} vs 기준</span>
        <details class="plan-day">
          <summary>결제일</summary>
          <div class="plan-day-body">
            <span class="plan-day-note">매월</span>
            <input class="plan-day-input" type="number" min="1" max="31" value="26" aria-label="${plan.name} 결제일"/>
            <span class="plan-day-note">일</span>
          </div>
        </details>
      </div>
    </div>`;
  const cb = li.querySelector(".plan-checkbox");
  cb.addEventListener("change", () => {
    cb.checked ? plan.__toggle?.() : plan.__toggle?.();
  });
  return li;
}

// #fx-header — "오늘 환율 1달러 = ₩N · M월 D일 오전 H시 m분 갱신" (KST 약어 제거, SPEC 형식은 title 속성)
function renderFxHeader(el, krwRate, updatedAtUtc, fetchedAt) {
  const kst = formatKstUpdate(updatedAtUtc); // 'YYYY-MM-DD HH:mm:ss KST'
  const specFormat = `1$ = ₩${krwRate} (한국 시간 갱신: ${kst})`;
  el.title = specFormat; // SPEC 형식은 title 속성에 (시세 약어 제거)
  // 쉬운 말: KST·"한국 시간" 약어 제거, 한국어 날짜
  const m = kst.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) KST$/);
  const dateText = m
    ? `${Number(m[2])}월 ${Number(m[3])}일 ${Number(m[4])}시 ${Number(m[5])}분 갱신`
    : "최근 갱신";
  el.textContent = `오늘 환율 1달러 = ${krw(krwRate)} · ${dateText}`;
}

function renderCoin(el, label, c) {
  el.textContent = `1${label} = ${krw(c.krw)} (${c.changeText})`;
}

// 계산기 화면 전체 렌더. textContent 로 값을 채운다(SPEC).
export function renderCalcScreen(root, { fx, coin, state, meta }) {
  const result = calculateSubKrw(fx, coin, state.selectedPlanIds, state.baselineKrwRate);
  const isExample = state.__example;

  // #fx-header
  renderFxHeader(root.querySelector("#fx-header"), result.krwRate, result.updatedAtUtc, meta);

  // #first-value-banner: "오늘 환율 기준 월 ₩N원, 기준 환율 대비 ±₩M원"
  const banner = root.querySelector("#first-value-banner");
  const diff = result.totalDiffMonthlyKrw;
  banner.innerHTML = "";
  banner.append(`오늘 환율 기준 월 ${krw(result.totalMonthlyKrw)}원, `);
  const d = document.createElement("span");
  d.className = diff > 0 ? "ds-up" : diff < 0 ? "ds-down" : "ds-flat";
  d.textContent = `기준 환율 대비 ${diff > 0 ? "+" : diff < 0 ? "−" : ""}${krw(Math.abs(diff))}`;
  banner.append(d);

  // 예시 배지: 기본 상태 또는 예시 버튼 후, 사용자가 바꾸면 숨김.
  const badge = root.querySelector("#example-badge");
  if (badge) badge.hidden = !isExample;

  // 답 카드: 연 합계를 크게 + 한 문장 + 보조 3개.
  const answer = root.querySelector("#answer-card");
  if (answer) {
    answer.querySelector("#answer-num").innerHTML = `${krw(result.totalYearlyKrw)}<small> /년</small>`;
    answer.querySelector("#answer-text").textContent = diffText(diff);
    answer.querySelector("#answer-meta").innerHTML = `
      <div><dt>오늘 환율</dt><dd>${krw(result.krwRate)}</dd></div>
      <div><dt>월 합계</dt><dd>${krw(result.totalMonthlyKrw)}</dd></div>
      <div><dt>명세서 예상</dt><dd>${krw(result.items.reduce((s, i) => s + estimateForRow(i.monthlyKrw, SERVICE_MAP[i.id].billing), 0))}</dd></div>`;
  }

  // 정적 체크박스 6종과 상태 동기화(id 유지).
  for (const [id, plan] of Object.entries(PLAN_CATALOG)) {
    const cb = root.querySelector(`#plan-${id}`);
    if (cb) cb.checked = state.selectedPlanIds.includes(id);
  }

  // #selected-plan-list: 선택된 요금제 2단 줄(checkbox·제외 버튼 다시 바인딩).
  const list = root.querySelector("#selected-plan-list");
  list.innerHTML = "";
  for (const item of result.items) {
    const plan = PLAN_CATALOG[item.id];
    const row = renderPlanRow(item, plan, result.baselineRate, isExample);
    row.querySelector(".plan-checkbox").addEventListener("change", (e) => state.__onToggle?.(item.id, e.target.checked));
    row.querySelector(".plan-remove").addEventListener("click", () => state.__onToggle?.(item.id, false));
    list.append(row);
  }
  if (result.items.length === 0) {
    const li = document.createElement("li");
    li.className = "ds-empty";
    li.textContent = "선택한 구독이 없어요. 위에서 요금제를 골라 보세요.";
    list.append(li);
  }

  // 코인 요약
  renderCoin(root.querySelector("#btc-summary"), "BTC", result.coins.bitcoin);
  renderCoin(root.querySelector("#eth-summary"), "ETH", result.coins.ethereum);

  // 명세서 계산식 펼치기(#5): ESTIMATE_TAX·ESTIMATE_FEE 로 실제 숫자 채움.
  const details = root.querySelector("#estimate-details");
  if (details) {
    const sample = result.items[0] || { monthlyUsd: 1, monthlyKrw: 1331 };
    const s = SERVICE_MAP[result.items[0]?.id] || { billing: "usd" };
    details.querySelector("#estimate-formula").textContent =
      `표시 가격 ${krw(sample.monthlyKrw)} × 부가세 ${ESTIMATE_TAX * 100}% + 카드 수수료 ${ESTIMATE_FEE * 100}% = 명세서 약 ${krw(estimateForRow(sample.monthlyKrw, s.billing))}`;
  }

  return result;
}

// 체크박스·기준 환율 입력·예시 버튼 이벤트(SPEC: 바꿀 때마다 즉시 재계산).
export function bindCalcEvents(root, { onStateChange, onTryExample, getMeta }) {
  const recalc = () => {
    const state = root.__state;
    try {
      const { fx, coin, meta } = getMeta();
      renderCalcScreen(root, { fx, coin, state, meta });
      onStateChange(state);
    } catch (err) {
      root.dispatchEvent(new CustomEvent("calc-error", { detail: err }));
    }
  };
  root.querySelectorAll(".plan-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.id.replace(/^plan-/, "");
      const state = root.__state;
      if (state.__onToggle) state.__onToggle(id, cb.checked);
      state.__example = false; // 사용자가 바꿈 → 예시 배지 숨김
      recalc();
    });
  });
  const input = root.querySelector("#baseline-rate-input");
  if (input) {
    input.addEventListener("input", () => {
      const v = Number(input.value);
      const state = root.__state;
      if (Number.isFinite(v) && v > 0) {
        state.baselineKrwRate = v;
        state.__example = false;
        recalc();
      }
    });
  }
  root.querySelector("#try-example-button")?.addEventListener("click", () => {
    onTryExample();
  });
}
