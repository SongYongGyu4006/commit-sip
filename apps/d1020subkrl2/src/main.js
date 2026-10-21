// 시작 시 데이터와 저장 상태를 불러 화면을 초기화하고, 화면 전환·예시 버튼·오류 안내·
// 상태 변경 시 저장과 재렌더링을 조율한다.
import { calculateSubKrw, DEFAULT_STATE } from "./calc.js";
import { loadState, saveState, clearState, STORAGE_KEY } from "./storage.js";
import { loadAllData } from "./data.js";
import { renderCalcScreen, bindCalcEvents } from "./calcScreen.js";
import { renderManageScreen, exportResult, bindManageEvents } from "./manageScreen.js";

let data = null;
let state = loadState();
let result = null;
let currentScreen = "calc";

function setStatus(message, isError) {
  const status = document.querySelector("#app-status");
  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function clearOutputs() {
  for (const selector of ["#first-value-banner", "#fx-header", "#summary-json"]) {
    const el = document.querySelector(selector);
    if (el) el.textContent = "";
  }
  const list = document.querySelector("#selected-plan-list");
  if (list) list.replaceChildren();
  for (const box of document.querySelectorAll("input.plan-checkbox")) box.checked = false;
  const btc = document.querySelector("#btc-summary");
  const eth = document.querySelector("#eth-summary");
  if (btc) btc.textContent = "";
  if (eth) eth.textContent = "";
}

const pad = (n) => String(n).padStart(2, "0");

function formatMeta(meta, key) {
  if (!meta || typeof meta.fetched_at !== "string" || !meta.fetched_at) return "";
  const date = new Date(meta.fetched_at);
  if (Number.isNaN(date.getTime())) return "";
  return `데이터 기준: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} · 출처: ${meta.name || key}`;
}

// meta 의 이용 조건 원문(개발자용 지시문)을 사용자가 읽는 문장으로 다듬는다.
function formatTerms(terms) {
  if (!terms || typeof terms !== "string") return "";
  let out = terms
    .split(/[;,，]/)
    .map((s) => s.trim())
    .filter((s) => s && !s.includes("화면에") && !s.includes("표기"))
    .join(" · ");
  if (!out) return "무료 제공";
  if (!/Rates By Exchange Rate API/.test(out)) out += " · Rates By Exchange Rate API";
  return out;
}

function refresh(announce) {
  if (!data) return;
  let next;
  try {
    next = calculateSubKrw(data.fx, data.coin, state.selectedPlanIds, state.baselineKrwRate);
  } catch (err) {
    result = null;
    clearOutputs();
    if (/기준 환율은/.test(err.message)) {
      setStatus("기준 환율은 1보다 큰 숫자를 입력해 주세요. 0이거나 음수는 사용할 수 없습니다.", true);
    } else {
      setStatus(`계산할 수 없습니다: ${err.message} 입력값을 확인해 주세요.`, true);
    }
    return;
  }
  result = next;
  if (announce) setStatus("변경 내용이 저장되고 다시 계산되었습니다.", false);
  if (currentScreen === "calc") renderCalcScreen(next, state);
  renderManageScreen(next);
}

export function applyState(next, announce = true) {
  state = { selectedPlanIds: [...next.selectedPlanIds], baselineKrwRate: next.baselineKrwRate };
  saveState(state);
  refresh(announce);
}

export function showScreen(name) {
  currentScreen = name;
  document.querySelector("#screen-calc").hidden = name !== "calc";
  document.querySelector("#screen-manage").hidden = name !== "manage";
  document.querySelector("#nav-calc-button").setAttribute("aria-pressed", String(name === "calc"));
  document.querySelector("#nav-manage-button").setAttribute("aria-pressed", String(name === "manage"));
  if (result) {
    if (name === "calc") renderCalcScreen(result, state);
    renderManageScreen(result);
  }
}

export function init() {
  bindCalcEvents((next) => applyState(next));
  bindManageEvents({
    onExport: () => {
      if (!result) {
        setStatus("내보낼 계산 결과가 없습니다. 먼저 계산 화면에서 요금제를 골라 주세요.", true);
        return;
      }
      exportResult(result);
      setStatus("계산 결과를 JSON 파일로 내보냈습니다.", false);
    },
    onImport: (next) => {
      applyState(next);
      showScreen("calc");
      setStatus("파일을 불러와 결과를 다시 계산했습니다.", false);
    },
    onReset: () => {
      clearState();
      applyState({ selectedPlanIds: [...DEFAULT_STATE.selectedPlanIds], baselineKrwRate: DEFAULT_STATE.baselineKrwRate });
      setStatus("기본값으로 되돌렸습니다. 선택 요금제와 기준 환율이 초기화되었습니다.", false);
    },
    onResult: ({ error }) => setStatus(error, true),
  });
  document.querySelector("#try-example-button").addEventListener("click", () => {
    applyState({ selectedPlanIds: [...DEFAULT_STATE.selectedPlanIds], baselineKrwRate: DEFAULT_STATE.baselineKrwRate });
    setStatus("예시로 기본 구성(Netflix 프리미엄, ChatGPT Plus)을 채웠습니다.", false);
  });
  document.querySelector("#nav-calc-button").addEventListener("click", () => showScreen("calc"));
  document.querySelector("#nav-manage-button").addEventListener("click", () => showScreen("manage"));

  showScreen("calc");
  setStatus("환율과 코인 데이터를 불러오는 중입니다…", false);
  loadAllData()
    .then((loaded) => {
      data = loaded;
      document.querySelector("#fx-data-meta").textContent =
        formatMeta(loaded.fxMeta, "fx_rates") + " · " + formatTerms(loaded.fxMeta.terms) + " | " +
        formatMeta(loaded.coinMeta, "coin_price") + " · " + formatTerms(loaded.coinMeta.terms);
      state = loadState();
      saveState(state);
      refresh(false);
      setStatus("데이터를 불러왔습니다. 환율은 하루에 한 번만 갱신되며, 기준 환율은 직접 입력할 수 있습니다.", false);
    })
    .catch((err) => {
      data = null;
      result = null;
      clearOutputs();
      setStatus(`데이터를 불러오지 못했습니다: ${err.message} 인터넷 연결을 확인한 뒤 새로고침해 주세요.`, true);
    });
}

document.addEventListener("DOMContentLoaded", init);
