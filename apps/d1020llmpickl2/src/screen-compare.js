// 비교 화면: 두 select, 비교/해제 버튼, div#compare-output.
const $ = (id) => document.getElementById(id);
const mk = (tag, text, cls) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
// 값이 빠지면(데이터 키 누락 등) "undefined"가 아니라 "—" 으로 보여 준다.
const show = (v) => (v === undefined || v === null ? "—" : String(v));

const ROWS = [
  ["최대 메모리(GB)", "peak_memory_gb"],
  ["가중치(GB)", "weights_gb"],
  ["속도: 짧은 문장(t/s)", "gen_tps_short"],
  ["속도: 긴 문장(t/s)", "gen_tps_long"],
  ["한국어(KMMLU/50)", "kmmlu_of_50"],
  ["코딩(10점 만점)", "code_of_10"],
  ["도구(10점 만점)", "tools_of_10"],
  ["포맷(10점 만점)", "format_of_10"],
];

export function renderCompare(models, comparePair, result) {
  const fits = (m) => typeof m.peak_memory_gb === "number" ? m.peak_memory_gb < result.memoryGb : false;
  for (const id of ["compare-left-select", "compare-right-select"]) {
    const sel = $(id);
    const current = sel.value;
    sel.textContent = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "선택하지 않음";
    sel.appendChild(none);
    for (const m of models) {
      const o = document.createElement("option");
      o.value = m.model;
      o.textContent = fits(m) ? m.model : m.model + " (이 맥 메모리에 안 들어감)";
      sel.appendChild(o);
    }
    sel.value = current;
  }
  if (comparePair.length === 2) {
    $("compare-left-select").value = comparePair[0];
    $("compare-right-select").value = comparePair[1];
  }
  const out = $("compare-output");
  out.textContent = "";
  // SPEC: compare.must_show = ["왼쪽 모델", "오른쪽 모델", "비교 결과"] — 아직 비교 전에도 항상 존재
  out.appendChild(mk("h3", "비교 결과"));
  if (!result.comparison) {
    out.appendChild(mk("p", "왼쪽·오른쪽 모델을 고르고 [비교]를 누르세요.", "empty"));
    return;
  }
  const { left, right, diff } = result.comparison;
  const fit = (m) => (m.fitsMemory ? "" : " — 이 맥 메모리에 들어가지 않습니다");
  const cols = [left, right, diff];
  const head = document.createElement("div");
  head.className = "crow";
  for (let i = 0; i < 3; i++) {
    const cell = mk("div", "", "cell");
    cell.appendChild(mk("span", i === 0 ? "왼쪽 모델\n" + left.model + fit(left) : i === 1 ? "오른쪽 모델\n" + right.model + fit(right) : "비교 결과\n차이(왼쪽 − 오른쪽)", i === 2 ? "diff-val" : "val"));
    head.appendChild(cell);
  }
  out.appendChild(head);
  for (const [label, field] of ROWS) {
    const row = document.createElement("div");
    row.className = "crow";
    const labels = ["왼쪽 모델", "오른쪽 모델", "차이(왼쪽 − 오른쪽)"];
    for (let i = 0; i < 3; i++) {
      const cell = mk("div", "", "cell");
      const value = i === 2 ? diff[field] : cols[i][field];
      cell.appendChild(mk("span", labels[i] + "\n" + show(value), i === 2 ? "diff-val" : "val"));
      row.appendChild(cell);
    }
    out.appendChild(row);
  }
  const summary = mk("p", compareSummary(left, right, diff, result.memoryGb), "summary");
  out.appendChild(summary);
}

// 차이표 아래에 "어느 쪽이 더 나은지" 한 줄 요약 (정수 0 차이 = 동률).
function compareSummary(left, right, diff, memoryGb) {
  const items = [
    ["속도(짧은 문장)", diff.gen_tps_short, left.gen_tps_short, right.gen_tps_short],
    ["속도(긴 문장)", diff.gen_tps_long, left.gen_tps_long, right.gen_tps_long],
    ["한국어(KMMLU)", diff.kmmlu_of_50, left.kmmlu_of_50, right.kmmlu_of_50],
    ["코딩", diff.code_of_10, left.code_of_10, right.code_of_10],
    ["도구", diff.tools_of_10, left.tools_of_10, right.tools_of_10],
    ["포맷", diff.format_of_10, left.format_of_10, right.format_of_10],
  ];
  const leftWins = [], rightWins = [];
  for (const [label, d, lv, rv] of items) {
    if (lv === undefined || rv === undefined || d === undefined) continue;
    if (d > 0) leftWins.push(label);
    else if (d < 0) rightWins.push(label);
  }
  let s = "";
  if (!leftWins.length && !rightWins.length) s = "측정 값이 거의 비슷합니다.";
  else {
    if (leftWins.length) s += "왼쪽(" + left.model + ")이 " + leftWins.join("·") + "에서 앞섭니다. ";
    if (rightWins.length) s += "오른쪽(" + right.model + ")이 " + rightWins.join("·") + "에서 앞섭니다. ";
  }
  if (!left.fitsMemory) s += "왼쪽은 " + memoryGb + "GB 맥 메모리에 들어가지 않습니다. ";
  if (!right.fitsMemory) s += "오른쪽은 " + memoryGb + "GB 맥 메모리에 들어가지 않습니다. ";
  return s.trim();
}

export function bindCompare(onCompare, onClear) {
  $("compare-button").addEventListener("click", () => {
    onCompare($("compare-left-select").value, $("compare-right-select").value);
  });
  $("clear-compare-button").addEventListener("click", onClear);
}
