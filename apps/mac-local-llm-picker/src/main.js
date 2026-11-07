// 앱 진입점: 데이터 fetch → 상태 복원 → 화면 연결.
import { rankLocalModels } from "./app.js";
import { DEFAULT_STATE, normalizeState, toggleSaved, removeSaved, parseImportedState } from "./state.js";
import { loadState, saveState, clearState } from "./storage.js";
import { setStatus, renderHeader, setHeaderValues, downloadJson, readJsonFile } from "./ui.js";
import { renderRank, bindRank } from "./screen-rank.js";
import { renderCompare, bindCompare } from "./screen-compare.js";
import { renderSaved, bindSaved } from "./screen-saved.js";

const $ = (id) => document.getElementById(id);
const SCREENS = ["rank", "compare", "saved"];

// 데이터를 읽는다: fetch 로 실패해도 (file:// 등) import() 로 읽는다.
// import() 는 상대 경로가 안 되면 동기 예외를 던질 수 있어, 절대 경로로 시도해 항상 Promise 로 잡는다.
const loadDataFile = (rel) =>
  fetch(rel).then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).catch(() => import(new URL(rel, document.baseURL).href));

export async function init() {
  const modelNames = [];
  let models = [];
  let dataOk = true;

  // 1) 데이터 fetch (정적 서버 기준 상대 경로)
  let meta = null;
  try {
    const [bench, m] = await Promise.all([
      loadDataFile("data/local_llm_bench.json"),
      loadDataFile("data/local_llm_bench.meta.json"),
    ]);
    models = Array.isArray(bench.models) ? bench.models : [];
    meta = m && typeof m === "object" ? m : null;
    renderHeader(meta);
    setStatus("");
  } catch {
    dataOk = false;
    models = [];
    meta = null;
    renderHeader(null);
    setStatus("모델 데이터를 읽지 못했습니다. data/local_llm_bench.json 이 app/data 폴더에 있는지 확인해 주세요.", true);
  }

  for (const m of models) if (m && typeof m.model === "string") modelNames.push(m.model);

  // 2) 상태 복원 (localStorage)
  let state = { ...DEFAULT_STATE, comparePair: [], savedIds: [] };
  const saved = loadState();
  if (saved) {
    const n = dataOk ? normalizeState(saved, models) : null;
    if (n) state = n;
    else if (!dataOk) {
      // 데이터가 없어서 검증 못 해도 메모리·용도 정도는 복원
      state = { ...DEFAULT_STATE, comparePair: [], savedIds: [] };
    }
  }

  // 64·128GB 저장 상태: 그대로 두고(강제 48 전환 없음), 안내로 기준을 알린다 (1번).
  if (state.memoryGb > 48) {
    setStatus("64·128GB 맥을 고르셨어요. 실측은 48GB 맥뿐이라, 순위·비교는 48GB 맥 기준으로 보여 드려요.");
  }

  // 3) 첫 화면: 비교는 1등 시민이라 rank·compare 양쪽 탭에서 보이도록 (2번)
  for (const s of SCREENS) $("screen-" + s).classList.toggle("hidden", s !== "rank" && s !== "compare");
  for (const s of SCREENS) $("nav-" + s + "-btn").classList.toggle("active", s === "rank");
  for (const s of SCREENS) $("nav-" + s + "-btn").setAttribute("aria-pressed", String(s === "rank"));
  setHeaderValues(state.memoryGb, state.category);

  // 4) 공통 렌더/리렌더
  const runAndRender = () => {
    let result;
    try {
      result = rankLocalModels(models, state);
    } catch (err) {
      setStatus("상태를 계산하지 못했습니다: " + err.message + " (기존 저장 상태는 그대로 유지됩니다.)", true);
      return;
    }
    renderRank(result);
    renderCompare(models, state.comparePair, result);
    renderSaved(result);
  };

  const persist = () => {
    if (saveState(state)) setStatus("");
    else setStatus("상태를 브라우저에 저장하지 못했습니다.", true);
  };

  const applyChange = (next) => {
    if (!next) {
      setStatus("변경을 저장하지 못했습니다. 다시 시도해 주세요.", true);
      return;
    }
    state = next;
    persist();
    setHeaderValues(state.memoryGb, state.category);
    runAndRender();
  };

  // 5) 화면 전환
  const showScreen = (id) => {
    // 2번: rank 활성 시 compare + rank 동시 표시, compare 활성 시 compare 만, saved 활성 시 saved 만
    const hidden = (s) => id !== s && !(id === "rank" && s === "compare");
    for (const s of SCREENS) $("screen-" + s).classList.toggle("hidden", hidden(s));
    for (const s of SCREENS) $("nav-" + s + "-btn").classList.toggle("active", s === id);
    for (const s of SCREENS) $("nav-" + s + "-btn").setAttribute("aria-pressed", String(s === id));
  };
  for (const s of SCREENS) $("nav-" + s + "-btn").addEventListener("click", () => showScreen(s));

  // 6) 헤더 컨트롤
  $("memory-select").addEventListener("change", (e) =>
    applyChange(normalizeState({ ...state, memoryGb: Number(e.target.value) }, models)));
  $("category-select").addEventListener("change", (e) =>
    applyChange(normalizeState({ ...state, category: e.target.value }, models)));
  $("sample-button").addEventListener("click", () => {
    if (modelNames.length === 0) {
      setStatus("예시를 불러올 모델 데이터가 없습니다.", true);
      return;
    }
    const savedIds = state.savedIds.includes(modelNames[0]) ? state.savedIds : [...state.savedIds, modelNames[0]];
    const next = normalizeState(
      { memoryGb: 16, category: "korean", comparePair: modelNames.slice(0, 2), savedIds },
      models,
    );
    applyChange(next);
    if (next) setStatus("예시 데이터를 불러왔습니다: 16GB 맥, 한국어 용도, 앞의 두 모델을 비교에 골랐습니다.");
  });
  $("reset-button").addEventListener("click", () => {
    clearState();
    applyChange({ ...DEFAULT_STATE, comparePair: [], savedIds: [] });
    setStatus("모든 설정을 처음 상태로 되돌렸어요. 다시 골라 보세요.");
  });

  // 7) 각 화면
  bindRank((model) => {
    const next = toggleSaved(state, models, model);
    applyChange(next);
    if (next) setStatus(next.savedIds.includes(model) ? model + " 를 관심 모델에 저장했습니다." : model + " 를 관심 모델에서 뺐습니다.");
  });
  bindCompare(
    (left, right) => {
      if (!left || !right || left === right) {
        setStatus("서로 다른 두 모델을 골라 주세요.", true);
        return;
      }
      // import·예시로 48GB 실측 맥 상한에 못 들어가는 쌍이 들어와도 차단 (4번).
      const basis = Math.min(state.memoryGb, 48);
      for (const name of [left, right]) {
        const m = models.find((x) => x.model === name);
        if (m && !(m.peak_memory_gb < basis)) {
          setStatus(name + " 은(는) " + basis + "GB 실측 맥에 안 들어가요. 비교에서 뺐어요. 다른 모델을 골라 주세요.", true);
          return;
        }
      }
      applyChange(normalizeState({ ...state, comparePair: [left, right] }, models));
    },
    () => {
      applyChange(normalizeState({ ...state, comparePair: [] }, models));
    },
  );
  bindSaved(
    (model) => {
      applyChange(removeSaved(state, models, model));
    },
    () => {
      if (!state.savedIds.length) {
        setStatus("내보낼 관심 모델이 없습니다. 먼저 모델 순위 화면에서 모델을 저장해 주세요.", true);
        return;
      }
      downloadJson("llmpick-state.json", {
        memoryGb: state.memoryGb,
        category: state.category,
        comparePair: state.comparePair,
        savedIds: state.savedIds,
      });
    },
    async () => {
      const input = $("import-file");
      const text = await readJsonFile(input);
      input.value = "";
      if (text === null) return;
      const next = parseImportedState(text, models);
      if (!next) {
        setStatus("가져온 파일을 읽지 못했습니다. llmpick-state.json 형식인지 확인해 주세요. (기존 상태는 그대로 유지됩니다.)", true);
        return;
      }
      applyChange(next);
      setStatus("가져온 설정을 적용했습니다.");
    },
  );

  // 8) 결과 파일 내려받기: 화면의 pre#result-json 원문을 그대로 파일로 (5번: 파일 이름·내용은 그대로)
  const jsonDl = $("json-download");
  if (jsonDl)
    jsonDl.addEventListener("click", () => {
      const pre = $("result-json");
      if (!pre || !pre.textContent) return;
      downloadJson("llmpick-result.json", JSON.parse(pre.textContent));
    });

  // 9) 첫 렌더
  runAndRender();
}

// 앱 시작: DOM 이 준비되면 초기화 (async 이므로 오류는 catch 로 잡아 상태를 유지).
document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", () => init().catch((e) => {
    const st = document.getElementById("app-status");
    if (st) st.textContent = "앱을 시작하지 못했습니다: " + (e && e.message) + " (기존 저장 상태는 그대로 유지됩니다.)";
  }))
  : init().catch((e) => {
      const st = document.getElementById("app-status");
      if (st) st.textContent = "앱을 시작하지 못했습니다: " + (e && e.message) + " (기존 저장 상태는 그대로 유지됩니다.)";
    });
