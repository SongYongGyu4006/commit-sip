// 계산기 화면: 답 카드 → 구독 추가(검색·칩) → 내 구독(한 줄) → 환율+날짜선택 → 갱신 안내 → 부가세 → 코인(접힘) → 출처(접힘).
// CHANGES #1: summarize() 로 답 카드·배너·관리 화면 숫자 통일.
// CHANGES #3: 첫 화면 순서 재배치 — 답 → 구독추가 → 내구독 → 환율 → 세금 → 코인.
// CHANGES #5: 기준 환율 0 입력 시 빨간 오류, 성공 문구 안 보임.
// CHANGES #VISIBLE: 환율/날짜선택을 부가세보다 위에 배치, 갱신 안내를 별도 섹션으로 표시.
import { calculateSubKrw, PLAN_CATALOG, formatKstUpdate } from "./calc.js";
import { SERVICE_MAP, ESTIMATE_TAX, ESTIMATE_FEE, estimateBill, displayKrw, SEARCH_MAP, EXTRA_SERVICES, summarize } from "./services.js";
import { kstDateStr, kstDayName } from "./main.js";

function krw(n) {
  return `${Math.round(n).toLocaleString("ko-KR")}`;
}

function hueForName(name) {
  let h = 0;
  for (const c of name) h = (h + c.codePointAt(0)) % 8;
  return h;
}

// 화면 밖 변수(상태·setStatus) — 모듈에서 하나로 공유한다.
let state = { selectedPlanIds: [], baselineKrwRate: 1380, onToggle: null };
let statusEl = document.querySelector("#app-status");
function setStatus(text, kind = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "ds-status" + (kind ? " ds-status-" + kind : "");
}

// #fx-header: SPEC 형식(1$ = ₩N + 한국 시간 갱신)을 title에, 화면에는 날짜·시간만 작게.
function renderFxHeader(el, krwRate, updatedAtUtc) {
  if (!el) return;
  const kst = formatKstUpdate(updatedAtUtc); // 'YYYY-MM-DD HH:mm:ss KST'
  el.title = `1$ = ₩${krwRate} (한국 시간 갱신: ${kst})`;
  const m = kst.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) KST$/);
  el.textContent = m
    ? `₩${krwRate.toLocaleString("ko-KR")} · ${Number(m[2])}월 ${Number(m[3])}일 ${Number(m[4])}시 ${Number(m[5])}분 갱신`
    : `₩${krwRate.toLocaleString("ko-KR")}`;
}

// 띠의 칩 두 개: 환율과 갱신 날짜.
function renderBandChips(krwRate, updatedAtUtc) {
  const rate = document.querySelector("#fx-band-rate");
  const time = document.querySelector("#fx-band-time");
  if (rate) rate.textContent = `1달러 = ₩${krwRate.toLocaleString("ko-KR")}`;
  const kst = formatKstUpdate(updatedAtUtc);
  const m = kst.match(/^(\d{4})-(\d{2})-\d{2} \d{2}:\d{2}:\d{2} KST$/);
  if (time) time.textContent = m ? `한국 시간 ${kstDayName(m[0].slice(0, 10))} 갱신` : "최근 갱신";
}

// 서비스별 갱신 기간 차이 안내 — 환율 + 새로 고침 별도 섹션
function renderRefreshInfo(meta) {
  const note = document.querySelector("#refresh-note");
  if (!note || !meta) return;
  const nextUtc = meta.fx?.time_next_update_utc;
  const nextDate = nextUtc ? kstDateStr(nextUtc) : null;
  const nextTxt = nextDate ? `\n다음 갱신: ${kstDayName(nextDate)}` : "";
  note.textContent = `환율 데이터는 하루 1회(오늘) 갱신됩니다.${nextTxt}${nextTxt ? `\n다른 날짜는 갱신 후에 선택할 수 있어요.` : ""}`;
}

// 이번 달 환율 날짜 선택 — 오늘 날짜만 데이터가 있으므로 today만 입력 가능.
function renderFxRef(root, fx) {
  const input = document.querySelector("#fx-ref-day");
  const btn = document.querySelector("#fx-ref-today");
  if (!input || !fx) return;
  const kst = formatKstUpdate(fx.time_last_update_utc); // 'YYYY-MM-DD HH:mm:ss KST'
  const m = kst.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return;
  const today = kstDateStr(fx.time_last_update_unix ?? fx.time_last_update_utc);
  input.min = today;
  input.max = today;
  input.value = today;
  if (btn) btn.hidden = false;
  setStatus("");
  const refresh = () => {
    const v = input.value;
    if (!v) return;
    setStatus("");
  };
  input.addEventListener("change", refresh);
  if (btn) btn.addEventListener("click", () => { input.value = today; refresh(); });
}

// ③ 부가세·수수료: 국내 원화 청구는 부가세 포함·해외결제 수수료 없음, 달러 청구만 과세.
function renderTaxNote(root, items, krwRate) {
  const el = document.querySelector("#tax-note");
  if (!el) return;
  const krwPlans = items.filter((i) => SERVICE_MAP[i.id]?.billing === "krw" || (SEARCH_MAP[i.id]?.billing === "krw"));
  const usdPlans = items.filter((i) => SERVICE_MAP[i.id]?.billing === "usd" || (SEARCH_MAP[i.id]?.billing === "usd"));
  const krwNames = krwPlans.map((i) => { const p = PLAN_CATALOG[i.id]; return p ? p.name : (SEARCH_MAP[i.id]?.name || i.id); }).join("·");
  const usdNames = usdPlans.map((i) => { const p = PLAN_CATALOG[i.id]; return p ? p.name : (SEARCH_MAP[i.id]?.name || i.id); }).join("·");
  const pct = ((ESTIMATE_TAX + ESTIMATE_FEE) * 100).toFixed(1);
  if (items.length === 0) {
    el.textContent = "선택한 구독이 없어요. 구독을 고르면 세금·수수료 반영 방식을 여기 알려 드려요.";
    return;
  }
  if (krwPlans.length === 0) {
    el.textContent = `선택한 구독(${usdNames})은 모두 달러로 청구돼요. 명세서 예상액에 부가세·카드 해외결제 수수료(약 ${pct}%)가 붙어요.`;
    return;
  }
  if (usdPlans.length === 0) {
    el.textContent = `선택한 구독(${krwNames})은 모두 국내 원화 청구라 부가세가 이미 포함되어 있어요. 다시 세금을 붙이지 않으니, 표시 가격이 곧 명세서 금액이에요.`;
    return;
  }
  el.textContent = `${krwNames}는 국내 원화 청구라 부가세·해외결제 수수료가 이미 포함되어 추가 과세 없어요. ${usdNames}는 달러 청구라 명세서 예상액에 부가세·수수료(약 ${pct}%)가 붙어요.`;
}

// ④ 한 줄: [아바타] [이름 + 보조줄(의미 있는 정보만)] [오른쪽 금액 + ✕].
function renderPlanRow(item, krwRate) {
  const plan = PLAN_CATALOG[item.id];
  const s = plan ? SERVICE_MAP[item.id] : SEARCH_MAP[item.id];
  const billing = s ? s.billing : "usd";
  const monthlyKrw = displayKrw(plan || { id: item.id, monthlyUsd: 0 }, krwRate);
  const diff = item.diffMonthlyKrw;

  const subParts = [];
  if (billing === "krw") {
    subParts.push("원화 청구 · 부가세 포함");
  } else {
    subParts.push(`달러 청구 · 명세서 약 ${krw(estimateBill(monthlyKrw, "usd"))}원`);
    if (diff !== 0) {
      subParts.push(`기준 환율보다 ${krw(Math.abs(diff))}원 ${diff > 0 ? "비쌈" : "저렴"}`);
    }
  }

  const li = document.createElement("li");
  li.className = "ds-list-item";
  const displayName = plan ? plan.name : (s ? s.name : item.id);
  li.innerHTML = `
    <span class="ds-avatar" data-hue="${hueForName(displayName)}" aria-hidden="true">${displayName.slice(0, 1)}</span>
    <div class="ds-list-main">
      <span class="ds-list-title">${displayName}</span>
      <span class="ds-list-sub">${subParts.join(" · ")}</span>
    </div>
    <div class="ds-list-end">
      <span class="ds-list-amount">${krw(monthlyKrw)}원</span>
      <span class="ds-list-sub plan-month-note">월</span>
      <button type="button" class="plan-remove" aria-label="${displayName} 제외">
        <svg class="ds-icon-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>`;
  li.querySelector(".plan-remove").addEventListener("click", () => state.onToggle?.(item.id, false));
  return li;
}

function renderCoin(el, label, c) {
  el.textContent = `1${label} = ₩${krw(c.krw)} (${c.changeText})`;
}

// 구독 추가 카드: 기본 6종 체크박스 + EXTRA_SERVICES 검색.
function renderAddSubscription(root, selected, onToggle) {
  const list = root.querySelector("#plan-chip-list");
  const empty = root.querySelector("#plan-search-empty");
  const searchInput = root.querySelector("#plan-search");
  const planHint = root.querySelector(".plan-chip-hint");
  if (!list) return;

  const filter = (searchInput ? searchInput.value.trim().toLowerCase() : "");
  list.innerHTML = "";

  // 기본 6종 (CHECKBOX 유지 — SPEC 고정 id)
  for (const [id, plan] of Object.entries(PLAN_CATALOG)) {
    const show = !filter || plan.name.toLowerCase().includes(filter) || plan.id.toLowerCase().includes(filter);
    if (!show) continue;
    const checked = selected.includes(id);
    const li = document.createElement("li");
    li.className = "plan-chip";
    li.innerHTML = `<label class="ds-chip" aria-pressed="${checked}">
      <input type="checkbox" class="plan-checkbox" id="plan-${id}" ${checked ? "checked" : ""} aria-label="${plan.name} 선택" />
      ${plan.name}
    </label>`;
    li.querySelector("input").addEventListener("change", (e) => onToggle(id, e.target.checked));
    list.append(li);
  }

  // EXTRA_SERVICES 검색 결과 (CHECKBOX 대신 "+ 추가" 버튼)
  for (const es of EXTRA_SERVICES) {
    const matched = !filter ||
      es.name.toLowerCase().includes(filter) ||
      (es.alias || []).some(a => a.toLowerCase().includes(filter)) ||
      es.id.toLowerCase().includes(filter);
    if (!matched) continue;
    const li = document.createElement("li");
    li.className = "plan-chip";
    const isAdded = selected.includes(es.id);
    li.innerHTML = `<div class="ds-chip ${isAdded ? '' : 'plan-add-chip'}" style="display:flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;">
      <span>${es.name}</span>
      ${isAdded
        ? '<span class="ds-badge" style="font-size:11px;padding:1px 6px;">추가됨</span>'
        : `<button type="button" class="plan-add-btn" style="min-height:32px;padding:0 10px;font-size:13px;border-radius:8px;">＋ 추가</button>`}
    </div>`;
    if (!isAdded) {
      li.querySelector(".plan-add-btn").addEventListener("click", () => onToggle(es.id, true));
    }
    list.append(li);
  }

  if (empty) empty.hidden = list.children.length > 0;
  if (planHint) planHint.textContent = "서비스 선택";
}

// 검색창 바인딩.
function bindPlanSearch(root, onToggle) {
  const input = root.querySelector("#plan-search");
  if (!input) return;
  const refresh = () => {
    renderAddSubscription(root, state.selectedPlanIds, onToggle);
  };
  input.addEventListener("input", refresh);
  refresh();
}

// CHANGES #5: 기준 환율 입력 검증 — 0 이하 입력 시 aria-invalid + 오류, 성공 문구 X.
function setBaselineInput(value) {
  const input = document.querySelector("#baseline-rate-input");
  if (!input) return;
  if (value === null) return;
  input.value = String(value);
  input.removeAttribute("aria-invalid");
}

function setBaselineInvalid() {
  const input = document.querySelector("#baseline-rate-input");
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  const hint = input.parentElement?.querySelector(".ds-hint");
  if (hint) hint.textContent = "0이나 빈칸은 허용되지 않아요. 이전 값이 남아 있어요.";
  setStatus("기준 환율은 0보다 큰 숫자로 입력해 주세요 (예: 1380)", "bad");
}

function clearBaselineInvalid() {
  const input = document.querySelector("#baseline-rate-input");
  if (!input) return;
  input.removeAttribute("aria-invalid");
  const hint = input.parentElement?.querySelector(".ds-hint");
  if (hint) hint.textContent = "지난 7일 평균 환율을 넣으면 증감을 비교해요";
  if (statusEl && statusEl.classList.contains("ds-status-bad")) setStatus("");
}

// 데이터 메타: fetched_at + 이용 조건을 사용자 문구로.
function renderDataMeta(root, meta) {
  const el = root.querySelector("#fx-data-meta");
  if (!el || !meta) return;
  const fxDate = meta.fxMeta?.fetched_at;
  const coinDate = meta.coinMeta?.fetched_at;
  const parts = [];
  if (fxDate) parts.push(`환율 데이터는 ${kstDayName(String(fxDate).slice(0, 10))} 받은 걸 쓰고 있어요. 하루 1회 갱신되는 Exchange Rate API(무료)에서 가져오고, 화면에 출처를 표기해요.`);
  if (coinDate) parts.push(`코인 시세는 ${kstDayName(String(coinDate).slice(0, 10))} 받은 걸 쓰고 있어요. 실시간으로 갱신되는 CoinGecko(무료 공개 API, 호출 제한 있음)에서 가져와요.`);
  el.textContent = parts.join("\n") || "데이터 출처 정보를 불러올 수 없어요.";
}

// 계산기 화면 전체 렌더. 순서: 띠 → 답 카드 → 구독추가(검색+칩) → 내구독 + 기준환율 → 환율+날짜선택 → 갱신 안내 → 부가세 → 코인 → 출처.
export function renderCalcScreen(root, { fx, coin, state: appState, meta }) {
  state = appState;
  const result = calculateSubKrw(fx, coin, state.selectedPlanIds, state.baselineKrwRate);

  // 띠 칩 + #fx-header (SPEC 형식 title)
  renderBandChips(result.krwRate, result.updatedAtUtc);
  renderFxHeader(root.querySelector("#fx-header"), result.krwRate, result.updatedAtUtc);

  // 이번 달 환율 날짜 선택 (오늘만 입력 가능)
  renderFxRef(root, fx);

  // 서비스별 갱신 기간 안내 — 환율 바로 아래, 접히지 않음
  renderRefreshInfo(meta);

  // CHANGES #1: summarize() 로 요약 — 답 카드·배너·관리 화면 공통 사용.
  const summary = summarize(result.items, result.krwRate, result.baselineRate);
  const diff = result.totalDiffMonthlyKrw;

  // 첫 줄 요약 배너 (기존 #first-value-banner 자리)
  const banner = root.querySelector("#first-value-banner");
  if (banner) {
    banner.innerHTML = "";
    banner.append(`오늘 환율 기준 월 ${krw(summary.displayMonthly)}원, `);
    const d = document.createElement("span");
    if (diff !== 0) {
      d.className = diff > 0 ? "ds-up diff-up" : "ds-down diff-down";
      d.textContent = `기준 환율 대비 ${diff > 0 ? "+" : "−"}${krw(Math.abs(diff))}원`;
    } else {
      d.className = "ds-flat diff-even";
      d.textContent = "기준 환율과 같아요";
    }
    banner.append(d);
  }

  // 예시 배지
  const badge = root.querySelector("#example-badge");
  if (badge) badge.hidden = !state.__example;

  // 답 카드: CHANGES #1 — 월 합계 크게 + 한 문장 + 보조 3개(1년 구독료·명세서 예상·기준 환율)
  const answer = root.querySelector("#answer-card");
  if (answer) {
    answer.querySelector("#answer-num").innerHTML = `${krw(summary.displayMonthly)}<small>원 /월</small>`;
    answer.querySelector("#answer-text").textContent =
      result.items.length === 0
        ? "선택한 구독이 없어요. 아래 구독 추가에서 골라 보세요."
        : diff > 0
          ? `기준 환율(1$ = ${krw(result.baselineRate)}원)보다 월 ${krw(diff)}원 더 나가요.`
          : diff < 0
            ? `기준 환율(1$ = ${krw(result.baselineRate)}원)보다 월 ${krw(-diff)}원 덜 나가요.`
            : "기준 환율과 같은 금액이에요.";
    answer.querySelector("#answer-meta").innerHTML = `
      <div><dt>1년 구독료</dt><dd>${krw(summary.displayYearly)}원</dd></div>
      <div><dt>명세서 예상</dt><dd>${krw(summary.estimate)}원</dd></div>
      <div><dt>기준 환율</dt><dd>1$ = ${krw(result.baselineRate)}원</dd></div>`;
  }

  // CHANGES #4: setBaselineInput — 관리 화면 진입 전 기준 환율 입력값도 맞추기.
  setBaselineInput(state.baselineKrwRate);

  // 구독 추가 (CHANGES #3: 답 카드 다음으로 — 검색·칩)
  renderAddSubscription(root, state.selectedPlanIds, (id, checked) => {
    const s = root.__state;
    if (!s) return;
    if (checked && !s.selectedPlanIds.includes(id)) {
      s.selectedPlanIds.push(id);
    } else if (!checked) {
      s.selectedPlanIds = s.selectedPlanIds.filter(x => x !== id);
    }
    s.__example = false;
    clearBaselineInvalid();
    renderAll();
  });
  bindPlanSearch(root, (id, checked) => {
    const s = root.__state;
    if (!s) return;
    if (checked && !s.selectedPlanIds.includes(id)) {
      s.selectedPlanIds.push(id);
    } else if (!checked) {
      s.selectedPlanIds = s.selectedPlanIds.filter(x => x !== id);
    }
    s.__example = false;
    renderAll();
  });

  // 내 구독 목록 (CHANGES #3: 구독추가 다음)
  const list = root.querySelector("#selected-plan-list");
  list.innerHTML = "";
  for (const item of result.items) {
    list.append(renderPlanRow(item, result.krwRate));
  }
  if (result.items.length === 0) {
    const li = document.createElement("li");
    li.className = "ds-empty";
    li.textContent = "선택한 구독이 없어요. 아래 구독 추가에서 골라 보세요.";
    list.append(li);
  }

  // 선택 개수(구역 제목)
  const title = root.querySelector("#my-sub-list-title h2");
  if (title) title.textContent = result.items.length > 0 ? `내 구독 ${result.items.length}개` : "내 구독";

  // 내 구독 카드 안: 기준 환율 입력 (CHANGES #4 — renderAll 에서 setBaselineInput 호출)
  const baseInput = root.querySelector("#baseline-rate-input");
  if (baseInput) {
    baseInput.addEventListener("input", () => {
      const s = root.__state;
      if (!s) return;
      const v = Number(baseInput.value);
      if (baseInput.value.trim() === "" || !Number.isFinite(v) || v <= 0) {
        setBaselineInvalid();
        return; // 계산은 이전 값을 유지
      }
      clearBaselineInvalid();
      s.baselineKrwRate = v;
      s.__example = false;
      renderAll();
    });
  }

  // ③ 부가세·수수료 안내
  renderTaxNote(root, result.items, result.krwRate);

  // 코인 요약 (접힌 구역)
  renderCoin(root.querySelector("#btc-summary"), "BTC", result.coins.bitcoin);
  renderCoin(root.querySelector("#eth-summary"), "ETH", result.coins.ethereum);

  // 데이터 출처·이용 조건
  renderDataMeta(root, meta);

  return result;
}

// 체크박스·검색·기준 환율·환율 날짜·예시 버튼 이벤트.
export function bindCalcEvents(root, { onStateChange, onTryExample, getMeta }) {
  const recalc = () => {
    const s = root.__state;
    if (!s) return;
    try {
      const meta = getMeta();
      if (!meta) return;
      renderCalcScreen(root, { fx: meta.fx, coin: meta.coin, state: s, meta });
      onStateChange(s);
      clearBaselineInvalid();
    } catch (err) {
      root.dispatchEvent(new CustomEvent("calc-error", { detail: err }));
    }
  };
  const onToggle = (id, checked) => {
    const s = root.__state;
    if (!s) return;
    s.__onToggle?.(id, checked);
    s.__example = false;
    clearBaselineInvalid();
    renderAddSubscription(root, s.selectedPlanIds, onToggle);
    recalc();
  };
  // 칩 안의 체크박스(고정 id) 바뀔 때 재계산
  root.addEventListener("change", (e) => {
    if (e.target.classList?.contains("plan-checkbox")) {
      const id = e.target.id.replace(/^plan-/, "");
      onToggle(id, e.target.checked);
    }
  });

  root.querySelector("#try-example-button")?.addEventListener("click", () => onTryExample());
}
