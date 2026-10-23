// 시작·조율: 데이터+상태를 읽어 화면을 그리고, 화면 전환·예시·오류를 잇는다.
// CHANGES #4: renderAll() 에서 관리 화면도 항상 렌더, __state 를 화면에 바인딩, setBaselineInput 호출.
// CHANGES #5: 기준 환율 검증 — 0 이하 입력 시 오류, 성공 문구 표시 안 함.
import { calculateSubKrw, formatKstUpdate, DEFAULT_STATE, EXAMPLE_STATE } from "./calc.js";
import { summarize } from "./services.js";
import { loadState, saveState, clearState } from "./storage.js";
import { loadAllData } from "./data.js";
import { renderCalcScreen, bindCalcEvents } from "./calcScreen.js";
import { renderManageScreen, bindManageEvents } from "./manageScreen.js";

export { calculateSubKrw };

const $ = (sel) => document.querySelector(sel);

let calcState = { ...DEFAULT_STATE, __onToggle: null, __example: false };
let data = null; // { fx, coin, fxMeta, coinMeta }
let currentScreen = "calc";

function setStatus(text, kind = "") {
  const el = $("#app-status");
  if (!el) return;
  el.textContent = text;
  el.className = "ds-status" + (kind ? " ds-status-" + kind : "");
}

function setManageStatus(text, kind = "") {
  setStatus(text, kind);
}

// KST 날짜 문자열("2026-10-22")을 돌려 준다. UTC 타임스탬프 또는 UTC 문자열 둘 다 가능.
export function kstDateStr(t) {
  const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const g = (type) => parts.find((p) => p.type === type)?.value;
  if (!g("year") || !g("month") || !g("day")) return null;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// "2026-10-02" → "10월 2일"
export function kstDayName(ds) {
  const m = String(ds).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ds;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

// 저장(오류 안내는 호출처가 따로 한다) — __onToggle, __example 는 제외
function persist(s) {
  saveState({
    selectedPlanIds: s.selectedPlanIds,
    baselineKrwRate: s.baselineKrwRate,
    extraIds: s.extraIds || [],
    billingDays: s.billingDays || {},
    fxRefDay: s.fxRefDay || null,
  });
}

// 화면 전환. 예시 화면은 hidden, 계산기 화면은 보인다.
function showScreen(name) {
  currentScreen = name;
  $("#screen-calc").hidden = name !== "calc";
  $("#screen-manage").hidden = name !== "manage";
  $("#nav-calc-button").setAttribute("aria-pressed", String(name === "calc"));
  $("#nav-manage-button").setAttribute("aria-pressed", String(name === "manage"));
  document.title = name === "manage" ? "저장·내보내기 화면" : "구독 요금 계산기";
}

function renderAll() {
  if (!data) return;
  // CHANGES #4: 계산기 화면에도 관리 화면에도 __state 를 바인딩. 관리 화면도 항상 렌더.
  $("#screen-calc").__state = calcState;
  $("#screen-manage").__state = calcState;
  renderCalcScreen($("#screen-calc"), {
    fx: data.fx, coin: data.coin, state: calcState, meta: data,
  });
  renderManageScreen($("#screen-manage"), {
    fx: data.fx, coin: data.coin, state: calcState, meta: data,
  });
}

// #attribution-footer: 출처 표기만. 서비스별 갱신 주기·이용 조건은 계산기 화면의 접은 구역(#fx-data-meta)이 담당한다.
function renderFooter() {
  const el = $("#attribution-footer");
  if (!el) return;
  el.querySelector(".attr-text").textContent = "Rates By Exchange Rate API · CoinGecko · CC BY 4.0";
}

const PLAN_CATALOG_ORDER = [
  "netflix_standard", "netflix_premium", "spotify_premium",
  "chatgpt_plus", "notion_plus", "youtube_premium",
  "apple_music", "toss_prime", "coupang_wow", "tving", "wavve",
  "melon", "disney_plus", "youtube_music", "naver_plus_membership",
  "wachta", "millions_library", "netflix_basic",
];

function onStateChange(s) {
  persist(s);
}

// "예시로 해 보기": 기본값(3개+1350)과 눈에 띄게 다른 구성.
async function runExample() {
  calcState = {
    ...calcState,
    selectedPlanIds: [...EXAMPLE_STATE.selectedPlanIds],
    baselineKrwRate: EXAMPLE_STATE.baselineKrwRate,
    __example: true,
  };
  persist(calcState);
  renderAll();
  setStatus("예시로 채웠어요. 인기 구독 3개, 기준 환율 1,350원.", "good");
}

async function init() {
  calcState = { ...loadState(), __onToggle: null, __example: false };
  calcState.__onToggle = (id, checked) => {
    const set = new Set(calcState.selectedPlanIds);
    if (checked) set.add(id); else set.delete(id);
    calcState.selectedPlanIds = PLAN_CATALOG_ORDER.filter((x) => set.has(x));
  };

  $("#nav-calc-button").addEventListener("click", () => showScreen("calc"));
  $("#nav-manage-button").addEventListener("click", () => showScreen("manage"));
  $("#try-example-button").addEventListener("click", () => runExample());

  bindCalcEvents($("#screen-calc"), {
    onStateChange,
    onTryExample: () => $("#try-example-button")?.click(),
    getMeta: () => data,
  });
  bindManageEvents($("#screen-manage"), {
    onStateChange,
    getMeta: () => data,
    onImport: (next) => {
      calcState = { ...next, __onToggle: calcState.__onToggle, __example: false };
      persist(calcState);
      renderAll();
      showScreen("calc");
      setManageStatus("파일을 불러와 계산기 화면에 반영했어요.", "good");
    },
    onReset: () => {
      clearState();
      calcState = { ...DEFAULT_STATE, __onToggle: calcState.__onToggle, __example: false };
      renderAll();
      showScreen("calc");
      setManageStatus("기본값으로 되돌렸어요.", "good");
    },
    setManageStatus,
  });
  $("#screen-calc").addEventListener("calc-error", (e) => {
    setStatus(e.detail.message, "bad");
  });

  showScreen("calc");

  let loadError = null;
  try {
    data = await loadAllData();
  } catch (err) {
    loadError = err;
  }

  if (loadError) {
    setStatus(`데이터를 불러오지 못했어요: ${loadError.message}`, "bad");
    clearState();
    renderFooter();
    return;
  }
  renderAll();
  renderFooter();
}

document.addEventListener("DOMContentLoaded", init);
