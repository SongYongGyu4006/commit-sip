// 공통 DOM 도우미: 상태 메시지, 데이터 메타, 헤더 select 값, 파일 다운로드/읽기.

export function setStatus(message, isError = false) {
  const el = document.getElementById("app-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("ok", !isError);
}

// 값이 빠지거나 숫자가 아니면(데이터 키 누락·undefined·NaN) "undefined"가 아닌 "—" 으로.
// 비교·순위·저장 화면의 모든 숫자 표시가 이 한 곳만 경유한다 (원인 한 곳에서).
export const fmtOrDash = (v, suffix = "") =>
  v == null || typeof v !== "number" || !Number.isFinite(v)
    ? "—"
    : String(v) + suffix;

export function renderHeader(meta) {
  const el = document.getElementById("data-meta");
  if (el) {
    const stamp = meta && meta.fetched_at ? meta.fetched_at.replace("T", " ").slice(0, 16) : "";
    const terms = meta ? meta.terms || "" : "불러오는 중";
    // 실측 맥(48GB) 기준을 항상 안내: 64·128GB 를 골라도 데이터는 48GB 맥에서만 잰 값.
    el.textContent =
      "데이터 기준: " + stamp + " · 실측: 48GB 맥 · " + terms;
  }
  const foot = document.getElementById("data-terms");
  if (foot && meta) foot.textContent = meta.terms || "";
}

export function setHeaderValues(memoryGb, category) {
  const m = document.getElementById("memory-select");
  const c = document.getElementById("category-select");
  if (m) m.value = String(memoryGb);
  if (c) c.value = category;
}

// 원시 결과: 화면의 <pre id="result-json"> 에 JSON.stringify 로 보여 준다 (SPEC 고정 id).
export function setResultJson(result) {
  const pre = document.getElementById("result-json");
  if (pre) pre.textContent = JSON.stringify(result);
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// file input 의 파일을 읽은 뒤 text 로 resolved 한다 (파일이 없으면 null).
export async function readJsonFile(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return null;
  return file.text();
}
