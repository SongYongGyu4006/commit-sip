// 관심 모델 화면: ul#saved-list, 삭제 버튼, 내보내기 버튼, input#import-file.
import { fmtOrDash } from "./ui.js";
const $ = (id) => document.getElementById(id);
const mk = (tag, text, cls) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

export function renderSaved(result) {
  const list = $("saved-list");
  list.textContent = "";
  if (!result.savedModels.length) {
    list.appendChild(mk("li", "저장한 모델이 없습니다. 순위 화면에서 모델 옆의 '저장' 버튼을 눌러 보세요.", "stat"));
    return;
  }
  const basis = Math.min(result.memoryGb, 48); // 1번·4번과 공유: 실측 맥(48GB) 상한 기준
  for (const m of result.savedModels) {
    const li = document.createElement("li");
    li.appendChild(
      mk("span", m.model + (!m.fitsMemory && m.peak_memory_gb >= basis ? " — 이 맥 메모리에 들어가지 않습니다" : ""), "rmodel"),
    );
    li.appendChild(mk("span", "최대 메모리 " + fmtOrDash(m.peak_memory_gb, " GB") + " · 속도(짧은 문장) " + fmtOrDash(m.gen_tps_short, " t/s"), "stat"));
    const btn = document.createElement("button");
    btn.className = "remove-saved-btn";
    btn.type = "button";
    btn.textContent = "삭제";
    li.appendChild(btn);
    list.appendChild(li);
  }
}

export function bindSaved(onRemove, onExport, onImport) {
  $("saved-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button.remove-saved-btn");
    if (!btn) return;
    onRemove(btn.closest("li").querySelector(".rmodel").textContent.split(" — ")[0].trim());
  });
  $("export-button").addEventListener("click", onExport);
  $("import-file").addEventListener("change", onImport);
}
