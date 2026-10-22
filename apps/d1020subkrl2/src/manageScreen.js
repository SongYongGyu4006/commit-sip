// 저장·내보내기 화면: 계산 결과 미리보기, JSON 내보내기, 불러오기, 초기화.
import { PLAN_CATALOG, DEFAULT_STATE, DEFAULT_BASELINE_KRW_RATE } from "./calc.js";

export function renderManageScreen(result, state = { selectedPlanIds: [], baselineKrwRate: DEFAULT_BASELINE_KRW_RATE }) {
  const out = { ...result, selectedPlanIds: state.selectedPlanIds, baselineKrwRate: state.baselineKrwRate };
  document.querySelector("#summary-json").textContent = JSON.stringify(out, null, 2);
  document.querySelector("#summary-text").textContent =
    `선택: ${state.selectedPlanIds.map((id) => PLAN_CATALOG[id]?.name).join(", ") || "없음"} · 월 ${
      out.totalMonthlyKrw.toLocaleString("ko-KR")
    }원 · 연 ${out.totalYearlyKrw.toLocaleString("ko-KR")}원`;
}

export function exportResult(result, state = { selectedPlanIds: [], baselineKrwRate: DEFAULT_BASELINE_KRW_RATE }) {
  const out = { ...result, selectedPlanIds: state.selectedPlanIds, baselineKrwRate: state.baselineKrwRate };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `구독요금-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        reject(new Error("파일이 JSON 형식이 아닙니다. 내보낸 .json 파일을 선택해 주세요."));
        return;
      }
      const ids = Array.isArray(parsed.selectedPlanIds) ? parsed.selectedPlanIds.filter((id) => typeof id === "string" && PLAN_CATALOG[id]) : [];
      const rate = typeof parsed.baselineKrwRate === "number" && Number.isFinite(parsed.baselineKrwRate) && parsed.baselineKrwRate > 0 ? parsed.baselineKrwRate : DEFAULT_BASELINE_KRW_RATE;
      if (ids.length === 0) reject(new Error("파일 안에 선택한 구독이 없습니다. 계산 결과 파일을 불러올 수 없어요."));
      else resolve({ selectedPlanIds: ids, baselineKrwRate: rate });
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요. 다시 선택해 주세요."));
    reader.readAsText(file);
  });
}

export function bindManageEvents({ onExport, onImport, onReset, onResult }) {
  document.querySelector("#export-button").addEventListener("click", onExport);
  document.querySelector("#reset-button").addEventListener("click", onReset);
  document.querySelector("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      onImport(file).then(onResult);
    } catch (err) {
      onResult({ error: err.message });
    }
  });
}
