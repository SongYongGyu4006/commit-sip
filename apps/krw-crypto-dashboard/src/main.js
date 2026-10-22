// 시작: 저장 상태 복원 → 화면 전환 연결 → 데이터 로드(또는 예시) → 대시보드 렌더
import { summarizeKrwCoins } from "./app.js";
import { loadAllData, SAMPLE_DATA } from "./data.js";
import { loadCoinIds, setExample } from "./storage.js";
import { renderDashboard, renderError, bindExample } from "./dashboard.js";
import { initCoinsScreen, initBackupScreen } from "./coins-backup.js";

const $ = (sel) => document.querySelector(sel);

let coinIds = loadCoinIds();
let isExample = false;
let liveData = null;

function show(name) {
  for (const id of ["dashboard", "coins", "backup"]) {
    const section = $("#screen-" + id);
    if (id === name) section.removeAttribute("hidden");
    else section.setAttribute("hidden", "");
  }
  for (const id of ["dashboard", "coins", "backup"]) {
    $("#nav-" + id).classList.toggle("active", id === name);
  }
}

function metaOf(data) {
  return { coinMeta: data.coinMeta, fxMeta: data.fxMeta };
}

function refresh() {
  const data = isExample ? SAMPLE_DATA : liveData;
  if (!data) return;
  try {
    const result = summarizeKrwCoins(data.coinPrice, data.fxRates, coinIds);
    renderDashboard(result, metaOf(data), isExample);
    bindExample(isExample);
  } catch {
    renderError("데이터를 계산하지 못했습니다", "데이터 형식이 올바르지 않아 표시할 수 없습니다");
  }
}

async function boot() {
  for (const name of ["dashboard", "coins", "backup"]) {
    $("#nav-" + name).addEventListener("click", () => show(name));
  }
  initCoinsScreen(() => coinIds, (ids) => {
    coinIds = ids;
    isExample = false;
    refresh();
    show("dashboard");
  });
  initBackupScreen(() => coinIds, (ids) => {
    coinIds = ids;
    isExample = false;
    refresh();
    show("dashboard");
  }, (msg) => {
    $("#app-status").textContent = msg;
  });
  // 토글: 예시 모드는 세션 한정(새로고침하면 실데이터로). 이미 예시 중이면 다시 눌러 실데이터로.
  $("#example-button").addEventListener("click", () => {
    isExample = !isExample;
    setExample(isExample);
    refresh();
  });
  try {
    liveData = await loadAllData();
  } catch {
    $("#app-status").textContent = "데이터 파일을 불러오지 못했습니다";
    return;
  }
  refresh();
}

show("dashboard");
boot();
