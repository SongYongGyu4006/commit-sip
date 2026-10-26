// 공통 DOM 도우미: 상태 메시지, 데이터 메타, 헤더 select 값, 파일 다운로드/읽기.

export function setStatus(message, isError = false) {
  const el = document.getElementById("app-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("ok", !isError);
}

// 실측된 메모리 범위: 이 범위 안이 "실측", 밖은 "미실측" (64·128).
export function measuredRange() {
  const el = document.getElementById("answer-measured");
  if (el) el.textContent = "8–48GB";
}

export function renderHeader(meta) {
  const el = document.getElementById("data-meta");
  if (el) {
    const stamp = meta && meta.fetched_at ? meta.fetched_at.replace("T", " ").slice(0, 16) : "";
    el.textContent = "데이터 기준: " + stamp + " · " + (meta ? meta.terms || "" : "불러오는 중");
  }
  const foot = document.getElementById("data-terms");
  if (foot && meta) foot.textContent = meta.terms || "";
}

export function setHeaderValues(memoryGb, category) {
  const m = document.getElementById("memory-select");
  const c = document.getElementById("category-select");
  if (m) m.value = String(memoryGb);
  if (c) c.value = category;
  const note = document.querySelector(".mem-note");
  if (note) note.hidden = memoryGb <= 48; // 64·128(미실측)을 고르면 안내 배지
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
