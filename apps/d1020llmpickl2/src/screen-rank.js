// 순위 화면: ul#rank-list, 저장 토글 버튼, pre#result-json.
const $ = (id) => document.getElementById(id);
const mk = (tag, text, cls) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

export function renderRank(result) {
  const list = $("rank-list");
  list.textContent = "";
  if (!result.ranked.length) {
    list.appendChild(mk("li", "이 메모리에 맞는 모델이 없습니다. 더 큰 맥 메모리를 골라 보세요.", "stat"));
  }
  for (const m of result.ranked) {
    const li = document.createElement("li");
    const name = mk("span", m.model, "rmodel");
    li.appendChild(name);
    for (const [label, val] of [
      ["순위", m.rank],
      ["최대 메모리", m.peak_memory_gb + " GB"],
      ["가중치", m.weights_gb + " GB"],
      ["속도(짧은 문장)", m.gen_tps_short + " t/s"],
      ["속도(긴 문장)", m.gen_tps_long + " t/s"],
      ["한국어(KMMLU/50)", m.kmmlu_of_50],
      ["코딩(10점 만점)", m.code_of_10],
      ["도구(10점 만점)", m.tools_of_10],
      ["포맷(10점 만점)", m.format_of_10],
    ]) {
      const s = mk("span", "", "stat");
      s.appendChild(document.createTextNode(label + " "));
      s.appendChild(mk("b", String(val)));
      li.appendChild(s);
    }
    const btn = document.createElement("button");
    btn.className = "save-toggle-btn";
    btn.type = "button";
    btn.textContent = m.isSaved ? "저장 해제" : "저장";
    li.appendChild(btn);
    list.appendChild(li);
  }
  $("result-json").textContent = JSON.stringify(result);
}

// 저장 토글: data-model 속성으로 위임한 이벤트 콜백을 넘겨 받는다.
export function bindRank(onToggle) {
  $("rank-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button.save-toggle-btn");
    if (!btn) return;
    const li = btn.closest("li");
    onToggle(li.querySelector(".rmodel").textContent);
  });
}
