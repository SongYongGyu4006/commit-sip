// 계산기 화면: 답 카드 → 이번 달 환율(기준 날짜 선택) → 내 구독(한 줄) → 구독 추가(검색·칩)
// → 부가세·수수료 안내 → 코인(접힘) → 데이터 출처(접힘).
// VISIBLE.md: ①서비스별 갱신 기간 차이 ②이번 달 환율 날짜 선택 ③원화 청구 부가세·수수료 미부과
// ④목록 1줄(아바타·이름·금액)+의미 없는 줄 제거 — 네 가지가 앱 열자마자 보이고 바로 쓸 수 있게.
import { calculateSubKrw, PLAN_CATALOG, formatKstUpdate } from "./calc.js";
import { SERVICE_MAP, ESTIMATE_TAX, ESTIMATE_FEE, estimateBill, displayKrw } from "./services.js";
import { kstDateStr, kstDayName } from "./main.js";

function krw(n) {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
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
    ? `1$ = ₩${krwRate.toLocaleString("ko-KR")} · ${Number(m[2])}월 ${Number(m[3])}일 ${Number(m[4])}시 ${Number(m[5])}분 갱신`
    : `1$ = ₩${krwRate.toLocaleString("ko-KR")}`;
}

// 띠의 칩 두 개: 환율과 갱신 날짜.
function renderBandChips(krwRate, updatedAtUtc) {
  const rate = document.querySelector("#fx-band-rate");
  const time = document.querySelector("#fx-band-time");
  if (rate) rate.textContent = `1달러 = ₩${krwRate.toLocaleString("ko-KR")}`;
  const kst = formatKstUpdate(updatedAtUtc);
  const m = kst.match(/^(\d{4})-(\d{2})-(\d{2}) \d{2}:\d{2}:\d{2} KST$/);
  if (time) time.textContent = m ? `한국 시간 ${kstDayName(m[0].slice(0, 10))} 갱신` : "최근 갱신";
}

// ① 서비스별 갱신 기간 차이: 각 출처의 갱신 주기·다음 갱신을 화면에 보여 준다.
// 환율은 하루 1회(오늘 0시경), 코인 시세는 실시간이라 갱신 주기가 서로 다름.
function renderRefreshInfo(meta) {
  const title = document.querySelector("#fx-ref-title h2");
  const note = document.querySelector("#fx-ref-note");
  if (!title || !meta) return;
  title.textContent = "환율";
  const nextUtc = meta.fx?.time_next_update_utc;
  const nextDate = nextUtc ? kstDateStr(nextUtc) : null;
  const nextTxt = nextDate ? `다음 갱신 ${kstDayName(nextDate)}` : "";
  note.textContent = `출처별 갱신 주기가 달라요. 환율(Exchange Rate API)은 하루 1회, 오늘 0시경 갱신 — ${nextTxt} 예정. 코인 시세(CoinGecko)는 실시간으로 갱신돼요.`;
}

// ② 이번 달 환율 날짜 선택: <input type=date> 로 이번 달 1일~오늘을 고를 수 있게.
// (실제 월별 환율 파일은 아직 받아 두지 못해 고르면 안내만 하고, 환율은 오늘 값으로 유지.)
function renderFxRef(root, fx) {
  const input = document.querySelector("#fx-ref-day");
  const btn = document.querySelector("#fx-ref-today");
  if (!input || !fx) return;
  const kst = formatKstUpdate(fx.time_last_update_utc); // 'YYYY-MM-DD HH:mm:ss KST'
  const m = kst.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (!m) return;
  const today = kstDateStr(fx.time_last_update_unix ?? fx.time_last_update_utc);
  const monthStart = `${m[1]}-${m[2]}-01`;
  input.min = monthStart;
  input.max = today ?? monthStart;
  input.value = today ?? monthStart;
  const refresh = () => {
    const v = input.value;
    if (!v) return;
    if (v === today) {
      btn.hidden = false;
      setStatus("");
    } else {
      btn.hidden = true;
      setStatus(`${kstDayName(v)} 환율은 아직 받아 두지 못했어요. 이 앱은 환율을 하루 1개(오늘)만 받아서요. 지금은 오늘 환율(₩${Math.round(fx.rates.KRW).toLocaleString("ko-KR")})로 계산해요.`, "warn");
    }
  };
  input.addEventListener("change", refresh);
  if (btn) btn.addEventListener("click", () => { input.value = today; refresh(); });
}

// ③ 부가세·수수료: 국내 원화 청구는 부가세 포함·해외결제 수수료 없음, 달러 청구만 과세.
function renderTaxNote(root, items, krwRate) {
  const el = document.querySelector("#tax-note");
  if (!el) return;
  const krwPlans = items.filter((i) => SERVICE_MAP[i.id]?.billing === "krw");
  const usdPlans = items.filter((i) => SERVICE_MAP[i.id]?.billing === "usd");
  const krwNames = krwPlans.map((i) => i.name).join("·");
  const usdNames = usdPlans.map((i) => i.name).join("·");
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
// 보조줄은 청구 방식 + (달러 청구일 때 명세서 예상). 원화 청구·차이 0이면 의미 없는 줄을 빼요.
function renderPlanRow(item, krwRate, baselineRate) {
  const plan = PLAN_CATALOG[item.id];
  const s = SERVICE_MAP[plan.id];
  const billing = s.billing;
  const monthlyKrw = displayKrw(plan, krwRate); // 원화 청구=국내 정가, 달러 청구=오늘 환율 환산
  const diff = item.diffMonthlyKrw;

  const subParts = [];
  if (billing === "krw") {
    subParts.push("원화 청구 · 부가세 포함");
  } else {
    subParts.push(`달러 청구 · 명세서 약 ${krw(estimateBill(monthlyKrw, "usd"))}`);
    if (diff !== 0) {
      subParts.push(`기준 환율보다 ${krw(Math.abs(diff))} ${diff > 0 ? "비쌈" : "저렴"}`);
    }
  }

  const li = document.createElement("li");
  li.className = "ds-list-item";
  li.innerHTML = `
    <span class="ds-avatar" data-hue="${hueForName(plan.name)}" aria-hidden="true">${plan.name.slice(0, 1)}</span>
    <div class="ds-list-main">
      <span class="ds-list-title">${plan.name}</span>
      <span class="ds-list-sub">${subParts.join(" · ")}</span>
    </div>
    <div class="ds-list-end">
      <span class="ds-list-amount">${krw(monthlyKrw)}</span>
      <span class="ds-list-sub plan-month-note">월</span>
      <button type="button" class="plan-remove" aria-label="${plan.name} 제외">
        <svg class="ds-icon-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>`;
  li.querySelector(".plan-remove").addEventListener("click", () => state.onToggle?.(item.id, false));
  return li;
}

function renderCoin(el, label, c) {
  el.textContent = `1${label} = ${krw(c.krw)} (${c.changeText})`;
}

// 구독 추가 카드의 칩(6종)을 만든다. 체크박스는 칩 안에 유지(고정 id).
function renderChipList(selected, onToggle, q = "") {
  const list = document.querySelector("#plan-chip-list");
  const empty = document.querySelector("#plan-search-empty");
  if (!list) return;
  list.innerHTML = "";
  let visible = 0;
  for (const [id, plan] of Object.entries(PLAN_CATALOG)) {
    const show = plan.name.toLowerCase().includes(q.toLowerCase()) || q === "";
    if (!show) continue;
    visible++;
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
  if (empty) empty.hidden = visible > 0;
}

// 검색창: 이름으로 칩을 걸러 준다. 결과가 없으면 안내 문구.
function bindPlanSearch(onToggle) {
  const input = document.querySelector("#plan-search");
  if (!input) return;
  const refresh = () => renderChipList(state.selectedPlanIds, onToggle, input.value.trim());
  input.addEventListener("input", refresh);
  refresh();
}

function setBaselineInput(value) {
  const input = document.querySelector("#baseline-rate-input");
  if (!input) return;
  if (value === null) return;
  input.value = String(value);
}

function setBaselineInvalid() {
  const input = document.querySelector("#baseline-rate-input");
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  setStatus("기준 환율은 0보다 큰 숫자로 입력해 주세요 (예: 1380)", "bad");
}

function clearBaselineInvalid() {
  const input = document.querySelector("#baseline-rate-input");
  if (!input) return;
  input.removeAttribute("aria-invalid");
  if (statusEl.classList.contains("ds-status-bad")) setStatus("");
}

// 계산기 화면 전체 렌더. 순서: 띠 → 답 카드 → 이번 달 환율 → 내 구독 → 구독 추가 → 세금 안내 → 코인 → 출처.
export function renderCalcScreen(root, { fx, coin, state: appState, meta }) {
  state = appState;
  const result = calculateSubKrw(fx, coin, state.selectedPlanIds, state.baselineKrwRate);

  // 띠 칩 + #fx-header (SPEC 형식 title)
  renderBandChips(result.krwRate, result.updatedAtUtc);
  renderFxHeader(root.querySelector("#fx-header"), result.krwRate, result.updatedAtUtc);

  // ① 서비스별 갱신 기간 차이 안내
  renderRefreshInfo(meta);

  // ② 이번 달 환율 날짜 선택
  renderFxRef(root, fx);

  // #first-value-banner: "오늘 환율 기준 월 ₩N원, 기준 환율 대비 ±₩M원" (0이면 "같아요")
  const banner = root.querySelector("#first-value-banner");
  const diff = result.totalDiffMonthlyKrw;
  banner.innerHTML = "";
  banner.append(`오늘 환율 기준 월 ${krw(result.totalMonthlyKrw)}원, `);
  const d = document.createElement("span");
  if (diff !== 0) {
    d.className = diff > 0 ? "ds-up diff-up" : "ds-down diff-down";
    d.textContent = `기준 환율 대비 ${diff > 0 ? "+" : "−"}${krw(Math.abs(diff))}`;
  } else {
    d.className = "ds-flat diff-even";
    d.textContent = "기준 환율과 같아요";
  }
  banner.append(d);

  // 예시 배지
  const badge = root.querySelector("#example-badge");
  if (badge) badge.hidden = !state.__example;

  // 명세서 예상 = 원화 청구 금액(정가 그대로) + 달러 청구 금액(오늘 환율 × 부가세·수수료).
  const estimateTotal = result.items.reduce((s, i) => {
    const p = PLAN_CATALOG[i.id];
    const s2 = SERVICE_MAP[i.id];
    return s + estimateBill(displayKrw(p, result.krwRate), s2.billing);
  }, 0);
  // 답 카드: 연 합계 크게 + 한 문장 + 보조 3개(월 합계·명세서 예상·기준 환율)
  const answer = root.querySelector("#answer-card");
  if (answer) {
    answer.querySelector("#answer-num").innerHTML = `${krw(result.totalYearlyKrw)}<small> /년</small>`;
    answer.querySelector("#answer-text").textContent =
      result.items.length === 0
        ? "선택한 구독이 없어요. 아래 구독 추가에서 골라 보세요."
        : diff > 0
          ? `기준 환율(1$ = ${krw(result.baselineRate)}원)보다 월 ${krw(diff)} 더 나가요.`
          : diff < 0
            ? `기준 환율(1$ = ${krw(result.baselineRate)}원)보다 월 ${krw(-diff)} 덜 나가요.`
            : "기준 환율과 같은 금액이에요.";
    answer.querySelector("#answer-meta").innerHTML = `
      <div><dt>월 합계</dt><dd>${krw(result.totalMonthlyKrw)}원</dd></div>
      <div><dt>명세서 예상</dt><dd>${krw(estimateTotal)}원</dd></div>
      <div><dt>기준 환율</dt><dd>1$ = ${krw(result.baselineRate)}원</dd></div>`;
  }

  // ④ 내 구독 목록(한 줄)
  const list = root.querySelector("#selected-plan-list");
  list.innerHTML = "";
  for (const item of result.items) {
    list.append(renderPlanRow(item, result.krwRate, result.baselineRate));
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

  // ③ 부가세·수수료 안내
  renderTaxNote(root, result.items, result.krwRate);

  // 코인 요약
  renderCoin(root.querySelector("#btc-summary"), "BTC", result.coins.bitcoin);
  renderCoin(root.querySelector("#eth-summary"), "ETH", result.coins.ethereum);

  // 데이터 출처·이용 조건(개발자 원문이 아닌 사용자 문구)
  renderDataMeta(root, meta);

  return result;
}

// 데이터 메타: fetched_at + 이용 조건을 사용자 문구로. (이전엔 13px 원문이 화면에 그대로 노출됐음)
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
    renderChipList(s.selectedPlanIds, onToggle, root.querySelector("#plan-search")?.value.trim() || "");
    recalc();
  };
  // 칩 안의 체크박스(고정 id) 바뀔 때 재계산
  root.addEventListener("change", (e) => {
    if (e.target.classList?.contains("plan-checkbox")) {
      const id = e.target.id.replace(/^plan-/, "");
      onToggle(id, e.target.checked);
    }
  });
  bindPlanSearch(onToggle);

  const input = root.querySelector("#baseline-rate-input");
  if (input) {
    input.addEventListener("input", () => {
      const s = root.__state;
      if (!s) return;
      const v = Number(input.value);
      if (input.value.trim() === "" || !Number.isFinite(v) || v <= 0) {
        setBaselineInvalid();
        return; // 계산은 이전 값을 유지
      }
      clearBaselineInvalid();
      s.baselineKrwRate = v;
      s.__example = false;
      recalc();
    });
  }
  root.querySelector("#try-example-button")?.addEventListener("click", () => onTryExample());
}
