// 저장·내보내기 화면: 계산 결과 미리보기, JSON 내보내기, 불러오기, 초기화.
import { DEFAULT_STATE, PLAN_CATALOG } from "./calc.js";

export function renderManageScreen(result) {
  const names = result.items.map((item) => item.name).join(", ") || "선택된 요금제 없음";
  const total = `월 총액 ₩${result.totalMonthlyKrw.toLocaleString("ko-KR")} / 연 총액 ₩${result.totalYearlyKrw.toLocaleString("ko-KR")}`;
  const diff = result.totalDiffMonthlyKrw === 0
    ? "기준 환율과 오늘 환율이 같아 변동 없음"
    : `기준 환율 대비 월 ${result.totalDiffMonthlyKrw > 0 ? "+" : "-"}₩${Math.abs(result.totalDiffMonthlyKrw).toLocaleString("ko-KR")}`;
  document.querySelector("#summary-text").textContent =
    `선택: ${names} · ${total} · ${diff}`;
  document.querySelector("#summary-json").textContent = JSON.stringify(result, null, 2);
}

export function exportResult(result) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.download = `구독요금-${stamp}.json`;
  anchor.click();
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
        reject(new Error("파일 내용이 JSON 형식이 아닙니다. 내보낸 .json 파일인지 확인해 주세요."));
        return;
      }
      const ids = Array.isArray(parsed.selectedPlanIds)
        ? parsed.selectedPlanIds.filter((id) => typeof id === "string" && PLAN_CATALOG[id])
        : [];
      if (ids.length === 0 && Array.isArray(parsed.items)) {
        // 선택 목록이 없는 결과 파일은 items 에 있는 요금제로 복구한다.
        for (const item of parsed.items) {
          const id = item && item.id;
          if (typeof id === "string" && PLAN_CATALOG[id] && !ids.includes(id)) ids.push(id);
        }
      }
      if (ids.length === 0) {
        reject(new Error("파일 안에 선택한 요금제가 없습니다. 계산 결과 파일로 불러올 수 없습니다."));
        return;
      }
      const rate =
        typeof parsed.baselineKrwRate === "number" && Number.isFinite(parsed.baselineKrwRate) && parsed.baselineKrwRate > 0
          ? parsed.baselineKrwRate
          : DEFAULT_STATE.baselineKrwRate;
      resolve({ selectedPlanIds: ids, baselineKrwRate: rate });
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다. 다시 선택해 주세요."));
    reader.readAsText(file);
  });
}

export function bindManageEvents({ onExport, onImport, onReset, onResult }) {
  document.querySelector("#export-button").addEventListener("click", onExport);
  document.querySelector("#reset-button").addEventListener("click", onReset);
  document.querySelector("#import-file").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const state = await parseImportedFile(file);
      onImport(state);
    } catch (err) {
      onResult({ error: err.message });
    }
  });
}
