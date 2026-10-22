// 진입점: 데이터·저장 상태 로드 → 화면 초기화 → 전환·예시·오류 안내 조율.
import { calculateSubKrw, PLAN_CATALOG, DEFAULT_STATE, EXAMPLE_STATE, DEFAULT_BASELINE_KRW_RATE, formatKstUpdate } from "./calc.js";
import { loadState, saveState, clearState } from "./storage.js";
import { loadAllData } from "./data.js";
import { renderCalcScreen, bindCalcEvents } from "./calcScreen.js";
import { renderManageScreen, exportResult, parseImportedFile, bindManageEvents } from "./manageScreen.js";

const screens = {
  calc: document.querySelector("#screen-calc"),
  manage: document.querySelector("#screen-manage"),
};
const statusEl = document.querySelector("#app-status");

let state = loadState();
let data = null;
let lastResult = null;

// SPEC: 기본값은 ["netflix_premium","chatgpt_plus"] + 1380. CHANGES #3: 첫 화면 인기 5개.
function freshState() {
  return { selectedPlanIds: [...DEFAULT_STATE.selectedPlanIds], baselineKrwRate: DEFAULT_BASELINE_KRW_RATE, __example: true };
}

export function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

export function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "ds-status" + (kind ? " ds-status-" + kind : "");
}

export function applyState(next) {
  Object.assign(state, next);
  saveState(state);
  recalc();
}

function clearOutputs() {
  document.querySelector("#first-value-banner").innerHTML = "";
  document.querySelector("#selected-plan-list").innerHTML = "";
  document.querySelector("#coin-section").innerHTML = "";
  document.querySelector("#fx-header").textContent = "";
  document.querySelector("#summary-json").textContent = "";
}

function recalc() {
  if (!data) return;
  try {
    lastResult = calculateSubKrw(data.fx, data.coin, state.selectedPlanIds, state.baselineKrwRate);
    renderCalcScreen(screens.calc, { fx: data.fx, coin: data.coin, state, meta: data.meta });
    renderManageScreen(lastResult, state);
  } catch (err) {
    setStatus(`계산할 수 없어요: ${err.message}. 데이터를 확인해 주세요.`, "bad");
    clearOutputs();
  }
}

// 저장된 상태가 기본/예시면 예시 배지, 아니면 일반.
function markExample() {
  const def = new Set(DEFAULT_STATE.selectedPlanIds);
  const ex = new Set(EXAMPLE_STATE.selectedPlanIds);
  state.__example =
    state.selectedPlanIds.every((id) => def.has(id)) && state.baselineKrwRate === DEFAULT_BASELINE_KRW_RATE;
}

async function init() {
  showScreen("calc");
  setStatus("환율·코인 데이터를 불러오는 중이에요…");
  markExample();
  try {
    const loaded = await loadAllData();
    data = loaded;
    // #attribution-footer: "Rates By Exchange Rate API · CoinGecko · CC BY 4.0" (SPEC 고정 문구)
    document.querySelector("#attribution-footer .attr-text").textContent = "Rates By Exchange Rate API · CoinGecko · CC BY 4.0";
    const { fxMeta, coinMeta } = loaded;
    // #fx-data-meta: 같은 문구를 한 번만. fetched_at → "데이터 기준: YYYY-MM-DD HH:MM"
    const fmt = (iso) => {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    document.querySelector("#fx-data-meta").textContent =
      `데이터 기준: ${fmt(fxMeta.fetched_at)} · 출처: Exchange Rate API, CoinGecko`;

    // 저장된 선택이 없으면 인기 5개 기본 + 예시 배지.
    if (state.selectedPlanIds.length === 0) {
      state = freshState();
      saveState(state);
    }
    markExample();

    screens.calc.__state = state;
    state.__onToggle = (id, checked) => {
      const i = state.selectedPlanIds.indexOf(id);
      if (checked && i < 0) state.selectedPlanIds.push(id);
      if (!checked && i >= 0) state.selectedPlanIds.splice(i, 1);
      state.__example = false;
      saveState(state);
      recalc();
    };

    bindCalcEvents(screens.calc, {
      onStateChange: (s) => saveState(s),
      onTryExample: () => {
        state.selectedPlanIds = [...EXAMPLE_STATE.selectedPlanIds];
        state.baselineKrwRate = EXAMPLE_STATE.baselineKrwRate;
        state.__example = true;
        saveState(state);
        document.querySelector("#baseline-rate-input").value = String(state.baselineKrwRate);
        recalc();
        setStatus("예시를 불러왔어요. 체크 박스나 기준 환율을 바꾸면 내 구독으로 계산돼요.", "good");
      },
      getMeta: () => data,
    });
    screens.calc.addEventListener("calc-error", (e) => {
      setStatus(`계산할 수 없어요: ${e.detail.message}. 데이터를 확인해 주세요.`, "bad");
      clearOutputs();
    });

    bindManageEvents({
      onExport: () => exportResult(lastResult, state),
      onImport: (file) => parseImportedFile(file),
      onReset: () => {
        clearState();
        state = freshState();
        saveState(state);
        document.querySelector("#baseline-rate-input").value = String(state.baselineKrwRate);
        recalc();
        showScreen("calc");
        setStatus("기본으로 돌려놨어요.", "good");
      },
      onResult: (payload) => {
        if (payload.error) {
          setStatus(payload.error, "bad");
          return;
        }
        Object.assign(state, payload);
        state.__example = false;
        saveState(state);
        document.querySelector("#baseline-rate-input").value = String(state.baselineKrwRate);
        recalc();
        showScreen("calc");
        setStatus("파일을 불러왔어요.", "good");
      },
    });

    // 화면 전환 버튼
    document.querySelector("#nav-calc-button").addEventListener("click", () => showScreen("calc"));
    document.querySelector("#nav-manage-button").addEventListener("click", () => showScreen("manage"));

    document.querySelector("#baseline-rate-input").value = String(state.baselineKrwRate);
    recalc();
    setStatus("");
  } catch (err) {
    data = null;
    setStatus(`데이터를 불러오지 못했어요: ${err.message}. 인터넷 연결을 확인해 주세요.`, "bad");
    clearOutputs();
  }
}

document.addEventListener("DOMContentLoaded", init);
