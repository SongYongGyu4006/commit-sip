// 저장·내보내기 화면: 계산 결과 미리보기(한 줄 문구) + JSON 접기 + 버튼 행.
// CHANGES #2: 계산기 화면의 시안(상단 카드·한 줄 요약·접기)을 그대로 따라 붙였다.
import { calculateSubKrw, PLAN_CATALOG, DEFAULT_STATE, EXAMPLE_STATE, formatKstUpdate } from "./calc.js";
import { SERVICE_MAP, estimateBill, displayKrw, ESTIMATE_TAX, ESTIMATE_FEE } from "./services.js";
import { kstDateStr, kstDayName } from "./main.js";

function krw(n) {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

export function renderManageScreen(root, { fx, coin, state }) {
  const result = calculateSubKrw(fx, coin, state.selectedPlanIds, state.baselineKrwRate);
  const text = root.querySelector("#summary-text");
  if (text) {
    if (result.items.length === 0) {
      text.textContent = "선택한 구독이 없어요. 계산기 화면에서 요금제를 고르면 결과에 들어와요.";
    } else {
      // 명세서 예상: 원화 청구는 정가 그대로(부가세 포함·수수료 없음), 달러 청구만 오늘 환율 × 부가세·수수료.
      const totalEstimate = result.items.reduce((s, i) => {
        const p = PLAN_CATALOG[i.id];
        const s2 = SERVICE_MAP[i.id];
        return s + estimateBill(displayKrw(p, result.krwRate), s2.billing);
      }, 0);
      const diff = result.totalDiffMonthlyKrw;
      text.textContent = `${result.items.length}개 구독을 선택했어요. 월 합계 ${krw(result.totalMonthlyKrw)}원, 명세서 예상 ${krw(totalEstimate)}원이고 기준 환율(1$ = ${krw(result.baselineRate)}원) 대비 ${
        diff > 0 ? `월 ${krw(diff)} 더` : diff < 0 ? `월 ${krw(-diff)} 덜` : "같은 금액"
      } 나가요.`;
    }
  }
  root.querySelector("#summary-json").textContent = JSON.stringify(result, null, 2);
}

export function exportResult(root, { fx, coin, state }) {
  const result = calculateSubKrw(fx, coin, state.selectedPlanIds, state.baselineKrwRate);
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "subkr-result.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function parseImportedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요. 다시 골라 주세요."));
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const ids = parsed.selectedPlanIds;
        if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string" || !PLAN_CATALOG[x])) {
          throw new Error("이 파일은 이 앱의 구독 구성이 아니에요. 계산기 화면에서 내보낸 .json 파일을 골라 주세요.");
        }
        const baseline = Number(parsed.baselineKrwRate ?? DEFAULT_STATE.baselineKrwRate);
        if (!Number.isFinite(baseline) || baseline <= 0) throw new Error("기준 환율 값이 잘못돼 있어요.");
        resolve({ selectedPlanIds: ids, baselineKrwRate: baseline });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}

export function bindManageEvents(root, { onStateChange, getMeta, onImport, onReset, setManageStatus }) {
  const recalc = () => {
    const s = root.__state;
    if (!s) return;
    try {
      const { fx, coin } = getMeta();
      renderManageScreen(root, { fx, coin, state: s });
      onStateChange(s);
    } catch (err) {
      setManageStatus(err instanceof Error ? err.message : String(err), "bad");
    }
  };
  root.querySelector("#export-button")?.addEventListener("click", () => {
    try {
      exportResult(root, { ...getMeta(), state: root.__state });
      setManageStatus("JSON 파일로 내보냈어요.", "good");
    } catch (err) {
      setManageStatus(err.message, "bad");
    }
  });
  const fileInput = root.querySelector("#import-file");
  root.querySelector("#import-button")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    if (!fileInput.files?.[0]) return;
    try {
      const next = await parseImportedFile(fileInput.files[0]);
      onImport(next);
    } catch (err) {
      setManageStatus(err.message, "bad");
    } finally {
      fileInput.value = "";
    }
  });
  root.querySelector("#reset-button")?.addEventListener("click", () => onReset());
}
