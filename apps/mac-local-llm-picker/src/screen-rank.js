// 순위 화면: .ds-answer 답 카드, ul#rank-list(번호·이름·점수·저장), 접힌 pre#result-json.
import { fmtOrDash, setResultJson } from "./ui.js";
const $ = (id) => document.getElementById(id);
const mk = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

// 용도별 주 지표 (대시보드: 답 카드와 목록 줄의 큰 숫자에 쓴다).
const METRIC = {
  korean: ["kmmlu_of_50", "한국어", (v) => fmtOrDash(v, "/50")],
  coding: ["code_of_10", "코딩", (v) => fmtOrDash(v, "점")],
  tools: ["tools_of_10", "도구", (v) => fmtOrDash(v, "점")],
  speed: ["gen_tps_short", "속도", (v) => fmtOrDash(v, " t/s")],
};
// 큰 숫자 옆에 작은 보조 값: 최대 메모리(GB)를 항상 보여 준다 (SPEC rank.must_show).
const SUB = ["peak_memory_gb", "메모리", (v) => fmtOrDash(v, "GB")];
// "자세히" 한 줄: 8개 항목을 한 문장으로 쓴다 (셀 각 1개, 휴대폰에서 겹침 없음).
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

// 64·128GB 선택 시에도 실측 데이터는 48GB 맥뿐이라, 그 기준임을 안내한다 (1번).
const over48 = (memoryGb) => memoryGb > 48;

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
    text.textContent =
      over48(result.memoryGb)
        ? "48GB 맥에서 실측한 모델은 모두 이 메모리에 들어가요. 하지만 골라둔 " + result.memoryGb + "GB 맥 기준으로선 들어가는 모델이 없어요. 48GB 이하로 내려 보세요."
        : "이 메모리에 들어가는 모델이 없습니다. 더 큰 메모리를 골라 보세요.";
    mem.textContent = result.memoryGb + "GB";
    tps.textContent = "—";
    count.textContent = "실측 " + result.totalCount + "개 중 0개";
    return;
  }
  num.textContent = top[metric] + (metric === "kmmlu_of_50" ? "/50" : metric === "gen_tps_short" ? " t/s" : "점");
  text.textContent =
    result.memoryGb + "GB 맥에서 " + label + "은 " + top.model + " 이(가) 1위예요. " +
    (over48(result.memoryGb)
      ? "실측은 48GB 맥뿐이라, 이 값은 48GB 맥 기준으로 보인 겁니다. 아래 비교와 순위도 48GB 실측 맥 기준으로 매겼어요."
      : "모두 이 맥(48GB)에서 직접 측정한 실측 값입니다. 바로 아래에서 둘 중 뭘 고를지 비교해 보세요.");
  mem.textContent = result.memoryGb + "GB" + (over48(result.memoryGb) ? " (실측은 48GB 맥 기준)" : "");
  tps.textContent = fmtOrDash(top.gen_tps_short, " t/s");
  count.textContent = "실측 " + result.totalCount + "개 중 " + result.eligibleCount + "개";
}

export function renderRank(result) {
  renderAnswer(result);

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
  const [metric, label, fmt] = METRIC[result.category];
  for (const m of result.ranked) {
    const li = mk("li");
    li.setAttribute("aria-label", m.model); // 긴 모델명 전체를 보조 기술로 (말줄임 되더라도)
    li.appendChild(mk("span", String(m.rank), "rank-num" + (m.rank === 1 ? " first" : "")));
    const main = mk("div", null, "rank-main");
    main.appendChild(mk("span", m.model, "rmodel"));
    if (recent(m)) main.appendChild(mk("span", "새로 잰", "ds-badge ds-badge-accent badge"));
    // 64/128GB 선택 시에도 실측 맥(48GB) 기준 적합/미달을 표시 (1번).
    if (over48(result.memoryGb) && m.peak_memory_gb >= 48)
      main.appendChild(mk("span", "48GB 실측 맥에 못 들어감", "ds-badge ds-badge-bad badge"));
    li.appendChild(main);
    li.appendChild(mk("span", label + " " + fmt(m[metric]) + " · 최대메모리 " + SUB[2](m[SUB[0]]), "rank-score"));
    const btn = mk("button", m.isSaved ? "저장 해제" : "저장", "save-toggle-btn");
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(m.isSaved));
    li.appendChild(btn);
    list.appendChild(li);
  }
  if (result.ranked.length > 1) {
    const tip = mk(
      "li",
      "각 줄은 이 용도 점수(한국어는 50점, 나머지는 10점 만점) 뒤에 최대 메모리 사용량을 함께 붙여 놨어요. '저장'을 누르면 관심 모델에 넣어 둘 수 있어요.",
      "rank-tip",
    );
    list.appendChild(tip);
  }
  // 원시 결과를 화면의 pre#result-json 에 보여 준다 (SPEC 고정 id; 접어 두어 화면을 지저분하게 안 함).
  const dl = $("json-download");
  if (dl) dl.hidden = !result.ranked.length;
  window.__lastResult = result;
  setResultJson(result);
}

// 저장 토글: data-model 속성으로 위임한 이벤트 콜백을 넘겨 받는다.
export function bindRank(onToggle) {
  $("rank-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button.save-toggle-btn");
    if (!btn) return;
    onToggle(btn.closest("li").querySelector(".rmodel").textContent);
  });
}
