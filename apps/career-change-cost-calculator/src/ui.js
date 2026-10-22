// 화면 연결: app.js 의 순수 함수(evaluateRetraining)를 불러와 input/버튼/결과 셀을 연결한다.
// Node에서 이 파일을 import해도 DOM이 없으므로 아무 일도 생기지 않는다 (initUI 내부 가드).
import { evaluateRetraining } from './app.js';
import { compareTiming } from './timing.js';
import { renderReport, downloadReport } from './report.js';

function initUI() {
  // Node 등 DOM이 없는 환경: 아무 일도 하지 않는다.
  if (typeof document === 'undefined') return;

  const $ = (id) => document.getElementById(id);

  const FIELDS = [
    { key: 'salaryLostWon', id: 'result-lost' },
    { key: 'gainPerYearWon', id: 'result-gain' },
    { key: 'yearsToRecoup', id: 'result-breakeven' },
    { key: 'breakEvenAtMonth', id: 'result-breakeven-months' },
    { key: 'netGainAt36mWon', id: 'result-net36' },
    { key: 'roiAt36mPct', id: 'result-roi' },
  ];

  const INPUTS = [
    { el: 'current-salary-input', label: '현재 연봉(원/년)' },
    { el: 'months-input', label: '학습·취업 준비(개월)' },
    { el: 'target-salary-input', label: '목표 연봉(원/년)' },
  ];

  // 숫자 포맷: 원은 ₩ + 1,000 단위 쉼표, 2소수(정수는 소수점 없음),
  // 개월/횟수/% 는 정수면 소수점 없이, 아니면 2자리까지(필요한 만큼만). null은 "—".
  const formatWon = (v) => (v === null ? '—' : '₩' + v.toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }));
  const formatNum = (v) => (v === null ? '—' : v.toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }));
  const formatPct = (v) => (v === null ? '—' : v.toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }) + '%');

  const formatValue = (key, v) => {
    if (key === 'roiAt36mPct') return formatPct(v);
    if (key === 'yearsToRecoup' || key === 'breakEvenAtMonth') return formatNum(v);
    return formatWon(v); // salaryLostWon, gainPerYearWon, netGainAt36mWon
  };

  // 결과 카드 맨 위의 큰 글씨 요약 문장. 한 문장 흐름으로 쓴다:
  // "이직 후 약 18개월이면 본전" / "3년 뒤엔 계속 근무보다 ₩30,000,000 이익". 손실이면 "손실".
  const setSummary = (res, currentSalaryWon) => {
    const el = $('result-summary');
    if (!el) return;
    el.classList.remove('neg');
    while (el.firstChild) el.removeChild(el.firstChild);
    const net = res.netGainAt36mWon;
    if (res.breakEvenAtMonth === null && res.gainPerYearWon <= 0) {
      const s = document.createElement('span');
      s.textContent = '연봉이 오르지 않아 손익분기점이 없습니다.';
      el.appendChild(s);
      return;
    }
    const s1 = document.createElement('span');
    if (res.breakEvenAtMonth === null) {
      s1.textContent = '연봉은 오르지만 이직준비 비용이 크네요';
    } else {
      s1.textContent = `이직 후 약 ${formatNum(res.breakEvenAtMonth)}개월이면 본전`;
    }
    const netAbs = '₩' + Math.abs(net).toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(net) ? 0 : 2, maximumFractionDigits: 2 });
    let s2;
    if (net > 0) {
      s2 = document.createElement('span');
      s2.textContent = `3년 뒤엔 계속 근무보다 ${netAbs} 이익`;
    } else if (net < 0) {
      s2 = document.createElement('span');
      s2.textContent = `3년 뒤엔 계속 근무보다 ${netAbs} 손실`;
    } else {
      s2 = document.createElement('span');
      s2.textContent = '3년 뒤엔 계속 근무와 총액이 같습니다';
    }
    // 순서: (1) 본전 문장, (2) 3년 뒤 이익/손실 문장 → 한 문장 흐름.
    el.appendChild(s1);
    el.appendChild(s2);
    if (net < 0) el.classList.add('neg');
  };

  // '계속 근무 vs 이직준비' 비교 막대.
  // 계속 근무 3년 누적 = 현재 연봉 × 3, 이직준비 후 3년 누적 = 현재 연봉 × 3 + 순이익.
  const setCompare = (res, currentSalaryWon) => {
    const bar = $('compare-bar');
    if (!bar) return;
    bar.textContent = '';
    const work3 = currentSalaryWon * 3; // 계속 근무 3년 누적
    const retr3 = work3 + res.netGainAt36mWon; // 이직준비 후 3년 누적
    const makeRow = (labelText, fillPct, amountText, noteText) => {
      const row = document.createElement('div');
      row.className = 'cmp-row';
      const lab = document.createElement('span');
      lab.className = 'cmp-label';
      lab.textContent = labelText;
      const track = document.createElement('span');
      track.className = 'cmp-track';
      const fill = document.createElement('span');
      fill.className = 'cmp-fill';
      fill.style.width = fillPct + '%';
      const val = document.createElement('span');
      val.className = 'cmp-value';
      val.textContent = amountText;
      const note = document.createElement('span');
      note.className = 'cmp-note';
      note.textContent = noteText;
      track.appendChild(fill);
      row.appendChild(lab);
      row.appendChild(track);
      row.appendChild(val);
      row.appendChild(note);
      return row;
    };
    const retrPct = work3 > 0 ? Math.max(0, Math.min(100, (retr3 / work3) * 100)) : 0;
    const diff = res.netGainAt36mWon; // 3년 누적 차이 = 순이익
    const diffText = diff === 0 ? '' : (diff > 0 ? '3년 누적 +' : '3년 누적 ') + formatWon(diff);
    bar.appendChild(makeRow('계속 근무 3년 누적', 100, formatWon(work3), ''));
    bar.appendChild(makeRow('이직준비 후 3년 누적', retrPct, formatWon(retr3), diffText));
  };

  // 시나리오 3줄 요약: 줄 1 본전, 줄 2 3년 차이, 줄 3 한 줄 판단.
  const buildLines = (res, months, currentSalaryWon) => {
    const lines = [];
    if (res.breakEvenAtMonth === null) {
      lines.push('연봉이 오르지 않아 본전이 없어요');
    } else {
      const total = Number.isFinite(months) && Number.isFinite(res.breakEvenAtMonth) ? Math.ceil(months + res.breakEvenAtMonth) : null;
      lines.push(`본전까지 ${formatNum(res.breakEvenAtMonth)}개월` + (total ? `(공부 기간 포함 ${total}개월째)` : ''));
    }
    const diff = res.netGainAt36mWon;
    if (!Number.isFinite(diff)) {
      lines.push('3년 뒤 차이는 계산할 수 없어요');
    } else if (diff > 0) {
      lines.push(`3년 뒤 계속 근무보다 ${formatWon(diff)} 더 받아요`);
    } else if (diff < 0) {
      lines.push(`3년 뒤 계속 근무보다 ${formatWon(Math.abs(diff))} 덜 받아요`);
    } else {
      lines.push('3년 뒤 계속 근무와 총액이 같아요');
    }
    if (res.gainPerYearWon <= 0) {
      lines.push('연봉이 오르지 않아 본전이 없어요');
    } else if (res.breakEvenAtMonth !== null && res.breakEvenAtMonth <= 36) {
      lines.push('3년 안에 회수 가능');
    } else {
      lines.push('3년 안에 회수되지 않아요');
    }
    return lines;
  };

  const setScenarioLines = (res, months, currentSalaryWon) => {
    const list = $('scenario-lines');
    if (!list) return;
    list.textContent = '';
    for (const text of buildLines(res, months, currentSalaryWon)) {
      const li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    }
  };

  // 학습 기간별 시나리오 표: 3·6·12개월을 각각 evaluateRetraining으로 계산.
  const setScenarioTable = (currentSalaryWon, months, targetSalaryWon) => {
    const wrap = $('scenario-table');
    if (!wrap) return;
    wrap.textContent = '';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const h of ['학습 기간', '본전까지', '3년 순이익']) {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const m of [3, 6, 12]) {
      const row = document.createElement('tr');
      if (m === months) row.className = 'is-active';
      const r = evaluateRetraining(currentSalaryWon, m, targetSalaryWon);
      const c1 = document.createElement('td');
      c1.textContent = `${m}개월`;
      const c2 = document.createElement('td');
      c2.textContent = r.breakEvenAtMonth === null ? '—' : `${formatNum(r.breakEvenAtMonth)}개월`;
      const c3 = document.createElement('td');
      c3.textContent = formatWon(r.netGainAt36mWon);
      row.appendChild(c1);
      row.appendChild(c2);
      row.appendChild(c3);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
  };

  // 협상 문장 만들기: 계산 수치로 이직 제안 문장을 자동 생성한다.
  // navigator.clipboard를 쓰지 않고 textarea.select() + document.execCommand('copy') 으로 복사.
  const buildNegoText = (res, current, target, months) => {
    if (res.gainPerYearWon <= 0) {
      if (res.gainPerYearWon < 0) {
        return `목표 연봉(${formatWon(target)})이 현재 연봉(${formatWon(current)})보다 낮아서 인상 폭이 없습니다. 연봉을 현재와 같은 수준으로 제시하시려면 이 문장을 활용하세요: "현재 ${formatWon(current)}원을 유지하면서, 역할·책임 확대를 제안합니다."`;
      }
      return `연봉이 오르지 않으므로(현재 ${formatWon(current)}원 = 목표 ${formatWon(target)}원), 이직보다 현 직장 내 승급·보직 변화를 먼저 제안하는 편이 좋습니다.`;
    }
    const gainAbs = formatWon(res.gainPerYearWon);
    const lostAbs = formatWon(res.salaryLostWon);
    const net = res.netGainAt36mWon;
    const netAbs = formatWon(Math.abs(net));
    const netPhrase = net > 0 ? `3년 기준 ${netAbs} 이익` : net < 0 ? `3년 기준 ${netAbs} 손실` : '3년 기준 정크(0)';
    return `현재 ${formatWon(current)}원에서 ${formatWon(target)}원으로 연 ${gainAbs} 인상을 제안드립니다. 이직준비 ${months}개월 동안 ${lostAbs}를 포기하므로, ${netPhrase}가 되는 수준이어야 합니다.`;
  };

  const showNego = (res, current, target, months) => {
    const box = $('nego-box');
    const area = $('nego-text');
    if (!box || !area) return;
    area.value = buildNegoText(res, current, target, months);
    box.hidden = false;
  };

  const copyNego = () => {
    const area = $('nego-text');
    if (!area || !area.value) return;
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    const btn = $('nego-copy');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = ok ? '복사됨!' : '복사 실패';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    }
  };

  // 이직 타이밍: 입력 3칸(상승률·성과급·남은 개월) 중 한 칸이라도 채우면 계산한다.
  // 비워 두면 기능은 꺼지고, evaluateRetraining에는 쓰지 않는다.
  const readTiming = () => {
    const read = (id) => {
      const raw = ($(id) || { value: '' }).value;
      const t = String(raw).trim();
      if (t === '') return null;
      const n = Number(t);
      return n; // 유효성 검증은 호출부에서 Number.isInteger/safe로
    };
    const rawRaise = read('raise-input');
    const rawBonus = read('bonus-input');
    const rawWait = read('wait-input');
    if (rawRaise === null && rawBonus === null && rawWait === null) return { active: false };
    return { active: true, raise: rawRaise, bonus: rawBonus, wait: rawWait };
  };

  const setTimingResult = (timing, current, months, target) => {
    const el = $('timing-result');
    if (!el) return;
    if (!timing.active) {
      el.textContent = '';
      return;
    }
    const { raise, bonus, wait } = timing;
    for (const [v, name] of [[raise, '연봉 상승률'], [bonus, '성과급'], [wait, '남은 개월']]) {
      if (v === null || !Number.isFinite(v)) {
        el.textContent = `${name}은(는) 0 이상의 정수로 입력해 주세요`;
        return;
      }
      if (!Number.isInteger(v) || v < 0 || !Number.isSafeInteger(v)) {
        el.textContent = `${name}은(는) 0 이상의 정수로 입력해 주세요(예: 5)`;
        return;
      }
    }
    let diff;
    try {
      diff = compareTiming(current, months, target, raise, bonus, wait);
    } catch {
      el.textContent = '이직 타이밍 계산 중 오류가 발생했습니다. 값을 다시 확인해 주세요.';
      return;
    }
    const abs = formatWon(Math.abs(diff));
    el.textContent =
      diff > 0
        ? `지금 이직 vs ${wait}개월 뒤 이직: ${wait}개월 기다리면 ${abs} 더 유리합니다`
        : diff < 0
          ? `지금 이직 vs ${wait}개월 뒤 이직: 지금 이직하는 편이 ${abs} 더 유리합니다`
          : `지금 이직 vs ${wait}개월 뒤 이직: 3년 총액이 같습니다`;
  };

  const saveReport = (current, months, target, res) => {
    const status = $('app-status');
    try {
      const negoText = $('nego-text') ? $('nego-text').value : buildNegoText(res, current, target, months);
      const canvas = renderReport({ currentSalaryWon: current, months, targetSalaryWon: target, res, negoText });
      downloadReport(canvas);
      if (status) status.textContent = '';
    } catch (e) {
      if (status) status.textContent = '이미지를 만들 수 없습니다. 브라우저에서 다시 시도해 주세요.';
      console.error(e);
    }
  };

  // 6개 dd 셀을 채우고, 요약/비교 막대/3줄/시나리오/협상 문장/타이밍을 만든다.
  const setResults = (res, currentSalaryWon, months, targetSalaryWon) => {
    for (const f of FIELDS) {
      const el = $(f.id);
      if (el) el.textContent = formatValue(f.key, res[f.key]);
    }
    setSummary(res, currentSalaryWon);
    setCompare(res, currentSalaryWon);
    setScenarioLines(res, months, currentSalaryWon);
    setScenarioTable(currentSalaryWon, months, targetSalaryWon);
    // 새 기능 3개를 첫 화면 결과 카드 안에 자동으로 갱신한다.
    showNego(res, currentSalaryWon, months, targetSalaryWon);
    setTimingResult(readTiming(), currentSalaryWon, months, targetSalaryWon);
  };

  // input 값을 읽는다. 빈 값 또는 정수/0이상/safe-integer이 아니면 invalid=true.
  function readField(id) {
    const el = $(id);
    const raw = el.value.trim();
    if (raw === '') return { value: null, invalid: true, reason: '값을 입력해 주세요' };
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { value: n, invalid: true, reason: '소수점 없이 정수로 입력해 주세요(예: 6)' };
    if (n < 0) return { value: n, invalid: true, reason: '0 이상의 숫자로 입력해 주세요' };
    if (!Number.isSafeInteger(n)) return { value: n, invalid: true, reason: '너무 큰 숫자입니다. 더 작은 값으로 입력해 주세요' };
    return { value: n, invalid: false };
  }

  function doCalc() {
    const status = $('app-status');
    const results = INPUTS.map((f) => ({ ...f, parsed: readField(f.el) }));
    const bad = results.filter((r) => r.parsed.invalid);
    if (bad.length) {
      status.textContent = bad.map((b) => `${b.label} ${b.parsed.reason}`).join(', ');
      const firstBad = bad[0];
      if (firstBad) {
        const el = $(firstBad.el);
        if (el && el.focus) el.focus();
      }
      return; // 모든 dd 셀과 input 값은 그대로 둔다.
    }
    status.textContent = '';
    try {
      const [currentSalaryWon, months, targetSalaryWon] = results.map((r) => r.parsed.value);
      const res = evaluateRetraining(currentSalaryWon, months, targetSalaryWon);
      setResults(res, currentSalaryWon, months, targetSalaryWon);
    } catch {
      status.textContent = '계산 중 오류가 발생했습니다. 값을 다시 확인해 주세요.';
    }
  }

  // 예시로 해 보기: 현실적인 예시 데이터를 채우고 바로 계산한다.
  function fillExample() {
    $('current-salary-input').value = '60000000';
    $('months-input').value = '6';
    $('target-salary-input').value = '80000000';
    doCalc();
  }

  // 사용자가 입력칸을 수정하면 예시 안내 문구를 숨긴다.
  function hideExampleHint() {
    const hint = $('example-hint');
    if (hint) hint.style.display = 'none';
  }

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  onReady(() => {
    const calcBtn = $('calc-button');
    const exampleBtn = $('example-button');
    if (calcBtn) calcBtn.addEventListener('click', doCalc);
    if (exampleBtn) exampleBtn.addEventListener('click', fillExample);

    // 예시 값을 자동 입력해 바로 채워진 결과를 보여 준다.
    fillExample();

    for (const f of INPUTS) {
      const el = $(f.el);
      if (el) el.addEventListener('input', hideExampleHint);
    }

    // 협상 문장: '협상 문장 만들기' 버튼을 누르면 문장이 나오고, '복사'가 동작한다.
    const negoBtn = $('nego-button');
    const negoArea = $('nego-text');
    if (negoBtn) {
      negoBtn.addEventListener('click', () => {
        const cur = readField('current-salary-input');
        const mo = readField('months-input');
        const tg = readField('target-salary-input');
        if (cur.invalid || mo.invalid || tg.invalid) {
          const status = $('app-status');
          const missing = [cur, mo, tg].filter((x) => x.invalid);
          if (status) status.textContent = '협상 문장을 만들려면 유효한 현재 연봉·개월·목표 연봉이 필요합니다. 기본 3값을 채워 주세요';
          return;
        }
        let res;
        try {
          res = evaluateRetraining(cur.value, mo.value, tg.value);
        } catch {
          return;
        }
        const box = $('nego-box');
        if (box) box.hidden = false;
        if (negoArea) negoArea.value = buildNegoText(res, cur.value, tg.value, mo.value);
        if (negoArea) negoArea.focus();
      });
    }
    const negoCopy = $('nego-copy');
    if (negoCopy) negoCopy.addEventListener('click', copyNego);

    // 이직 타이밍: '이직 타이밍 보기' 버튼을 누르면 한 줄 비교를 (재)계산한다.
    const timingBtn = $('timing-button');
    if (timingBtn) {
      timingBtn.addEventListener('click', () => {
        const cur = readField('current-salary-input');
        const mo = readField('months-input');
        const tg = readField('target-salary-input');
        if (cur.invalid || mo.invalid || tg.invalid) {
          const status = $('app-status');
          if (status) status.textContent = '이직 타이밍은 유효한 현재 연봉·개월·목표 연봉이 필요합니다. 기본 3값을 채워 주세요';
          return;
        }
        setTimingResult(readTiming(), cur.value, mo.value, tg.value);
      });
    }
    // 타이밍 입력칸이 바뀌면 결과가 있을 때 다시 계산한다.
    for (const id of ['raise-input', 'bonus-input', 'wait-input']) {
      const el = $(id);
      if (!el) continue;
      const refresh = () => {
        const cur = readField('current-salary-input');
        const mo = readField('months-input');
        const tg = readField('target-salary-input');
        if (cur.invalid || mo.invalid || tg.invalid) return;
        setTimingResult(readTiming(), cur.value, mo.value, tg.value);
      };
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    }

    // 결산 이미지 저장: 버튼을 누르면 한글이 깨지지 않은 1장짜리 PNG를 내려받는다.
    const reportBtn = $('report-button');
    if (reportBtn) {
      reportBtn.addEventListener('click', () => {
        const cur = readField('current-salary-input');
        const mo = readField('months-input');
        const tg = readField('target-salary-input');
        if (cur.invalid || mo.invalid || tg.invalid) {
          const status = $('app-status');
          if (status) status.textContent = '결산 이미지는 유효한 현재 연봉·개월·목표 연봉이 필요합니다. 기본 3값을 채워 주세요';
          return;
        }
        let res;
        try {
          res = evaluateRetraining(cur.value, mo.value, tg.value);
        } catch {
          const status = $('app-status');
          if (status) status.textContent = '이미지 계산 중 오류가 발생했습니다. 값을 다시 확인해 주세요.';
          return;
        }
        saveReport(cur.value, mo.value, tg.value, res);
      });
    }
  });
}

initUI();
