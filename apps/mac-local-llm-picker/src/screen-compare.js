// 비교 화면: 두 select, 비교/해제 버튼, div#compare-output.
const $ = (id) => document.getElementById(id);
const mk = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
// 값이 빠지면(데이터 키 누락 등) "undefined"가 아니라 "—" 으로 보여 준다.
const show = (v) => (v === undefined || v === null ? "—" : String(v));

// 비교 표의 행. weights_gb 는 SPEC 의 diff 에 없어서 화면에서 직접 차이를 계산한다.
const ROWS = [
  ["최대 메모리(GB)", "peak_memory_gb", (v) => String(v)],
  ["가중치(GB)", "weights_gb", (v) => String(v)],
  ["속도: 짧은 문장(t/s)", "gen_tps_short", (v) => String(v)],
  ["속도: 긴 문장(t/s)", "gen_tps_long", (v) => String(v)],
  ["한국어(KMMLU/50)", "kmmlu_of_50", (v) => String(v)],
  ["코딩(10점 만점)", "code_of_10", (v) => String(v)],
  ["도구(10점 만점)", "tools_of_10", (v) => String(v)],
  ["포맷(10점 만점)", "format_of_10", (v) => String(v)],
];
const FMT = {
  peak_memory_gb: (v) => v + " GB",
  weights_gb: (v) => v + " GB",
  gen_tps_short: (v) => v + " t/s",
  gen_tps_long: (v) => v + " t/s",
  kmmlu_of_50: (v) => v + "/50",
  code_of_10: (v) => v + "점",
  tools_of_10: (v) => v + "점",
  format_of_10: (v) => v + "점",
};

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
    out.appendChild(mk("p", "왼쪽·오른쪽 모델을 고르고 [비교]를 누르세요.", "cmp-empty"));
    return;
  }

  const { left, right, diff } = result.comparison;
  // 메모리에 안 들어가는 쪽이 있으면 표 위에 크게 경고한다.
  const missing = [];
  if (!left.fitsMemory) missing.push("왼쪽(" + left.model + ")");
  if (!right.fitsMemory) missing.push("오른쪽(" + right.model + ")");
  if (missing.length) {
    out.appendChild(mk("p", missing.join("과 ") + "은(는) " + result.memoryGb + "GB 맥에 들어가지 않습니다", "cmp-warn"));
  }

  const cell = (html, cls) => {
    const c = mk("div", null, cls);
    c.innerHTML = html;
    return c;
  };
  const head = mk("div", null, "cmp-row cmp-label-row");
  head.appendChild(cell("<span class='ds-hint'>비교 결과 — 왼쪽 모델</span>", "cmp-cell"));
  head.appendChild(cell("<span class='ds-hint'>오른쪽 모델</span>", "cmp-cell"));
  head.appendChild(cell("<span class='ds-hint'>차이(왼쪽 − 오른쪽)</span>", "cmp-cell diff-cell"));
  out.appendChild(head);

  // 모델 이름 행 (textContent 로, raw 데이터 그대로)
  const nameRow = mk("div", null, "cmp-row");
  const nl = mk("div", null, "cmp-cell");
  const nl2 = mk("span", left.model + (left.fitsMemory ? "" : " — 메모리 미달"), "cmp-name");
  nl.appendChild(nl2);
  const nr = mk("div", null, "cmp-cell");
  nr.appendChild(mk("span", right.model + (right.fitsMemory ? "" : " — 메모리 미달"), "cmp-name"));
  nameRow.appendChild(nl);
  nameRow.appendChild(nr);
  nameRow.appendChild(mk("div", null, "cmp-cell diff-cell"));
  out.appendChild(nameRow);

  for (const [label, field, fmt] of ROWS) {
    const row = mk("div", null, "cmp-row");
    row.appendChild(cell("<span class='ds-hint'>" + label + "</span><br>" + FMT[field](show(left[field])), "cmp-cell"));
    row.appendChild(cell("<span class='ds-hint'>" + label + "</span><br>" + FMT[field](show(right[field])), "cmp-cell"));
    // 차이: weights_gb 는 SPEC diff 에 없으므로 화면에서 직접 계산, 나머지 diff 값 사용.
    let dv = diff[field];
    if (dv === undefined && left[field] !== undefined && right[field] !== undefined)
      dv = Number((left[field] - right[field]).toFixed(3));
    let html;
    if (dv === undefined || dv === null) html = "<span class='diff-flat'>—</span>";
    else if (dv > 0) html = "<span class='diff-plus'>+" + dv + " (앞섬)</span>";
    else if (dv < 0) html = "<span class='diff-minus'>" + dv + " (뒤로)</span>";
    else html = "<span class='diff-flat'>0 (동률)</span>";
    row.appendChild(cell(html, "cmp-cell diff-cell"));
    out.appendChild(row);
  }
  out.appendChild(mk("p", compareSummary(left, right, diff, result.memoryGb), "cmp-summary"));
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
