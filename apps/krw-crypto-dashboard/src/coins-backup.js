// 코인 선택 화면과 백업 화면을 연결한다. 선택이 바뀔 때마다 onCoinIds(coinIds) 콜백으로 알린다.
import { saveCoinIds, clearCoinIds, validateImport, DEFAULT_COIN_IDS } from "./storage.js";

const $ = (sel) => document.querySelector(sel);

// [bitcoin, ethereum(, solana)] → 드롭다운 값
function extraOf(coinIds) {
  return coinIds.includes("solana") ? "solana" : "";
}

export function initCoinsScreen(getCoinIds, onCoinIds) {
  const select = $("#extra-coin");
  select.value = extraOf(getCoinIds());
  select.addEventListener("change", () => {
    const next = DEFAULT_COIN_IDS.slice();
    if (select.value === "solana") next.push("solana");
    saveCoinIds(next);
    onCoinIds(next);
  });
}

export function initBackupScreen(getCoinIds, onCoinIds, setStatus) {
  const exportBtn = $("#export-button");
  const importFile = $("#import-file");
  const resetBtn = $("#reset-button");

  exportBtn.addEventListener("click", () => {
    const data = JSON.stringify({ coinIds: getCoinIds() });
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "krcoinfx.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        setStatus("가져온 파일을 읽을 수 없습니다. krcoinfx.json 형식이 아닙니다");
        return;
      }
      const coinIds = validateImport(parsed);
      if (!coinIds) {
        setStatus("가져온 파일이 올바르지 않습니다. 비트코인과 이더리움을 포함하는 선택만 가져올 수 있습니다");
        return;
      }
      saveCoinIds(coinIds);
      setStatus("");
      onCoinIds(coinIds); // main에서 isExample=false 처리
    };
    reader.readAsText(file);
    importFile.value = "";
  });

  resetBtn.addEventListener("click", () => {
    clearCoinIds();
    setStatus("");
    onCoinIds(DEFAULT_COIN_IDS.slice());
  });
}
