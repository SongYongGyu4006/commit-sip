// 순위 화면: .ds-answer 답 카드, 한 줄 결론, ul#rank-list(두 줄), 저장 토글, pre#result-json.
const $ = (id) => document.getElementById(id);
const mk = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

// 용도별 주 지표 (대시보드: 답 카드와 카드의 큰 숫자에 쓴다).
const METRIC = {
  korean: ["kmmlu_of_50", "한국어", (v) => String(v) + "/50"],
  coding: ["code_of_10", "코딩", (v) => String(v) + "점"],
  tools: ["tools_of_10", "도구", (v) => String(v) + "점"],
  speed: ["gen_tps_short", "속도", (v) => String(v) + " t/s"],
};
// 큰 숫자 옆에 작은 보조 값: 최대 메모리(GB)를 항상 보여 준다 (SPEC rank.must_show).
const SUB = ["peak_memory_gb", "메모리", (v) => String(v) + "GB"];
const FMT = {
  peak_memory_gb: (v) => String(v) + " GB",
  weights_gb: (v) => String(v) + " GB",
  gen_tps_short: (v) => String(v) + " t/s",
  gen_tps_long: (v) => String(v) + " t/s",
  kmmlu_of_50: (v) => String(v),
  code_of_10: (v) => String(v),
  tools_of_10: (v) => String(v),
  format_of_10: (v) => String(v),
};
const DETAIL = [
  ["최대 메모리", "peak_memory_gb"],
  ["가중치", "weights_gb"],
  ["속도(짧은 문장)", "gen_tps_short"],
  ["속도(긴 문장)", "gen_tps_long"],
  ["한국어(KMMLU/50)", "kmmlu_of_50"],
  ["코딩(10점 만점)", "code_of_10"],
  ["도구(10점 만점)", "tools_of_10"],
  ["포맷(10점 만점)", "format_of_10"],
];
// 모델 이름에서 첫 글자와 색(hue 0~7)을 정한다 (같은 이름은 늘 같은 색).
const hueOf = (name) => [...String(name)].reduce((s, c) => s + c.codePointAt(0), 0) % 8;

// 답 카드(첫 화면 맨 위): 큰 숫자 + 한 문장 + 보조 숫자 3개.
export function renderAnswer(result) {
  const top = result.ranked[0];
  const [metric, label, fmt] = METRIC[result.category];
  const num = $("answer-num");
  const text = $("answer-text");
  const mem = $("answer-memory");
  const tps = $("answer-tps");
  const count = $("answer-count");
  if (!top) {
    num.textContent = "0위";
    text.textContent = "이 메모리에 들어가는 모델이 없습니다. 더 큰 메모리를 골라 보세요.";
    mem.textContent = result.memoryGb + "GB";
    tps.textContent = "—";
    count.textContent = "실측 " + result.totalCount + "개 중 0개";
    return;
  }
  num.textContent = top[metric] + (metric === "kmmlu_of_50" ? "/50" : metric === "gen_tps_short" ? " t/s" : "점");
  text.textContent =
    result.memoryGb + "GB 맥 · " + label + "에서는 " + top.model + " 이(가) 1위입니다. " +
    (result.memoryGb <= 48
      ? "모두 이 맥(48GB)에서 직접 측정한 값입니다."
      : "48GB에서 실측한 값으로, 이 메모리에 들어가는 모델만 골랐습니다.");
  mem.textContent = result.memoryGb + "GB";
  tps.textContent = top.gen_tps_short + " t/s";
  count.textContent = "실측 " + result.totalCount + "개 중 " + result.eligibleCount + "개";
}

export function renderRank(result) {
  renderAnswer(result);

  // 모델이 없으면 원시 JSON 은 닫아 둔다 (있으면 마지막에 접힌 채로).
  $("result-json-box").open = result.ranked.length > 0;

  // 목록 위: 한 줄 결론 (ranked[0] + eligibleCount + totalCount).
  const lead = $("rank-lead");
  if (!result.ranked.length) {
    lead.textContent = result.memoryGb + "GB 맥에 들어가는 모델이 없습니다.";
  } else {
    lead.textContent =
      result.memoryGb + "GB 맥에서 " + METRIC[result.category][1] + "은 " + result.ranked[0].model +
      " 이(가) 1위입니다 (실측 " + result.totalCount + "개 중 " + result.eligibleCount + "개).";
  }

  // 48GB 기준 실측 데이터: 48GB를 넘기면(미실측) 안내. 화면 전환과 겹치지 않게 class 로만.
  const warn = $("rank-warn");
  warn.classList.toggle("hidden", result.memoryGb <= 48);
  if (result.memoryGb > 48) {
    warn.textContent = "이 맥(48GB)에서만 쟰습니다. 64·128GB 는 미실측(추정 아님)이라, 실측한 모델 중 이 메모리에 들어가는 것만 보여 줍니다.";
  }

  // "새로 잰" 배지: 가장 최근 실측 날짜보다 7일 이내인 모델에만.
  const latest = result.ranked.reduce(
    (max, m) => Math.max(max, new Date(m.measured).getTime()),
    0,
  );
  const recent = (m) =>
    latest > 0 &&
    Number.isFinite(latest) &&
    latest - new Date(m.measured).getTime() <= 7 * 86400000;

  const list = $("rank-list");
  list.textContent = "";
  if (!result.ranked.length) {
    list.appendChild(mk("li", "이 메모리에 맞는 모델이 없습니다. 더 큰 맥 메모리를 골라 보세요.", "stat-empty"));
  }
  for (const m of result.ranked) {
    const [metric, label, fmt] = METRIC[result.category];
    const li = mk("li");
    li.appendChild(mk("span", String(m.rank), "rank-num" + (m.rank === 1 ? " first" : "")));
    const main = mk("div", null, "rank-main");
    main.appendChild(mk("span", m.model, "rmodel"));
    if (recent(m)) main.appendChild(mk("span", "새로 잰", "ds-badge ds-badge-accent badge"));
    li.appendChild(main);
    const score = mk("span", label + " " + fmt(m[metric]) + " · 메모리 " + SUB[2](m[SUB[1]]), "rank-score");
    li.appendChild(score);
    const btn = mk("button", m.isSaved ? "저장 해제" : "저장", "save-toggle-btn");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(m.isSaved));
    li.appendChild(btn);
    const det = document.createElement("details");
    det.className = "rank-details";
    const sum = document.createElement("summary");
    sum.textContent = "자세히";
    det.appendChild(sum);
    for (const [dl, f] of DETAIL) {
      const s = mk("span", null, "stat");
      s.appendChild(document.createTextNode(dl + " "));
      s.appendChild(mk("b", FMT[f](m[f])));
      det.appendChild(s);
    }
    li.appendChild(det);
    list.appendChild(li);
  }
  $("result-json").textContent = JSON.stringify(result);
}

// 저장 토글: data-model 속성으로 위임한 이벤트 콜백을 넘겨 받는다.
export function bindRank(onToggle) {
  $("rank-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button.save-toggle-btn");
    if (!btn) return;
    onToggle(btn.closest("li").querySelector(".rmodel").textContent);
  });
}
