// 화면 그리기: 모든 글자를 textContent로만 넣는다(innerHTML 사용 없음).

// 작업군 키 → 한국어 이름 (표 첫 열에 보여 준다. t.key 자체는 데이터 그대로 유지)
const TASK_NAMES = { coding: '코딩 (coding)', testing: '테스트 (testing)', docs: '문서화 (docs)', ops: '운영 (ops)' };

// 금액: 작업 1회 달러 하나로만. 없는 값은 '—'
function usdVisible(v) {
  if (v === null || typeof v !== 'number') return '—';
  return '$' + v;
}

// 금액 셀
function moneyCell(v) {
  const span = document.createElement('span');
  span.textContent = usdVisible(v);
  return { el: span };
}

// 4주 전 대비 변화: 0 → "변화 없음", null → "비교 자료 없음", ±% → 증감 기호 + (싸짐/비싸짐)
function changeSpan(v) {
  const span = document.createElement('span');
  if (v === null) { span.className = 'ds-flat'; span.textContent = '비교 자료 없음'; return span; }
  if (v > 0) { span.className = 'ds-up'; span.textContent = '+' + v + '% 비싸짐'; return span; }
  if (v < 0) { span.className = 'ds-down'; span.textContent = v + '% 싸짐'; return span; }
  span.className = 'ds-flat';
  span.textContent = '변화 없음';
  return span;
}

function cellChange(v) { return { el: changeSpan(v) }; }

function fillRow(tr, cells) {
  for (let i = 0; i < cells.length; i++) {
    const td = tr.cells[i];
    td.textContent = '';
    const c = cells[i];
    if (c && c.el) td.appendChild(c.el);
    else td.textContent = typeof c === 'string' ? c : '';
  }
}

// 대시보드: 작업군 비용 표 + 모델 요약 + 답 카드
export function renderDashboard(result, minContext = 0) {
  const tbody = document.querySelector('#task-table tbody');
  while (tbody.children.length < 4) {
    const tr = document.createElement('tr');
    for (let i = 0; i < 6; i++) tr.appendChild(document.createElement('td'));
    tbody.appendChild(tr);
  }
  while (tbody.children.length > 4) tbody.removeChild(tbody.lastElementChild);

  result.tasks.forEach((t, i) => {
    const tr = tbody.children[i];
    tr.id = 'task-' + t.key;
    tr.classList.toggle('ds-pick', i === 0);
    const cells = [TASK_NAMES[t.key] || t.key, String(t.eligibleCount)];
    if (t.cheapest) {
      const nameCell = { el: document.createElement('span') };
      nameCell.el.textContent = t.cheapest.name;
      cells.push(nameCell);
    } else cells.push('—');
    cells.push(moneyCell(t.cheapest ? t.cheapest.costUsd : null));
    cells.push(moneyCell(t.baselineCostUsd));
    cells.push(cellChange(t.changePct));
    fillRow(tr, cells);
  });

  // 최근 7일 신규·인기 모델 요약
  const lis = document.querySelectorAll('#hf-summary li');
  const li = lis[0];
  const li2 = lis[1];
  li.textContent = '';
  li2.textContent = '';
  const av = document.createElement('span');
  av.className = 'ds-avatar ds-avatar-s';
  av.setAttribute('data-hue', '5');
  av.textContent = 'H';
  av.setAttribute('aria-hidden', 'true');
  const main = document.createElement('div');
  main.className = 'ds-list-main';
  const title = document.createElement('span');
  title.className = 'ds-list-title';
  title.textContent = '최근 7일 신규 모델';
  const sub = document.createElement('span');
  sub.className = 'ds-list-sub';
  sub.textContent = '기준 시각 기준으로 지난 7일 등록분';
  main.append(title, sub);
  const end = document.createElement('div');
  end.className = 'ds-list-end';
  const amt = document.createElement('span');
  amt.className = 'ds-list-amount';
  amt.textContent = result.hf.newCount7d + '개';
  end.appendChild(amt);
  li.append(av, main, end);

  const av2 = document.createElement('span');
  av2.className = 'ds-avatar ds-avatar-s';
  av2.setAttribute('data-hue', '3');
  const tid = result.hf.topTrendingId;
  av2.textContent = tid ? [...tid][0].toUpperCase() : '?';
  av2.setAttribute('aria-hidden', 'true');
  const main2 = document.createElement('div');
  main2.className = 'ds-list-main';
  const title2 = document.createElement('span');
  title2.className = 'ds-list-title';
  title2.textContent = tid || '데이터 없음';
  title2.title = tid || '';
  const sub2 = document.createElement('span');
  sub2.className = 'ds-list-sub';
  sub2.textContent = '가장 인기 있는 모델 (trending)';
  main2.append(title2, sub2);
  const end2 = document.createElement('div');
  end2.className = 'ds-list-end';
  const badge = document.createElement('span');
  badge.className = 'ds-badge ds-badge-accent';
  badge.textContent = '인기 1위';
  end2.appendChild(badge);
  li2.append(av2, main2, end2);

  // 최저값(코딩 작업군)을 답 카드로
  const cheapestCoding = result.tasks[0].cheapest;
  const num = document.querySelector('#answer-num');
  num.textContent = '';
  const textNode = document.createTextNode(cheapestCoding ? usdVisible(cheapestCoding.costUsd) : '—');
  const small = document.createElement('small');
  small.textContent = ' / 작업당';
  num.append(textNode, small);
  document.querySelector('#answer-text').textContent = cheapestCoding
    ? '코딩 작업 1회당 가장 싼 모델은 ' + cheapestCoding.name + '이에요.'
    : '조건에 맞는 모델이 없어요. 기준 컨텍스트 길이를 낮춰 보세요.';

  const dateEl = document.querySelector('#answer-date');
  if (dateEl) dateEl.textContent = result.asOf;
  const ctxEl = document.querySelector('#answer-ctx');
  if (ctxEl) ctxEl.textContent = minContext > 0 ? minContext.toLocaleString('ko-KR') + ' 토큰 이상' : '모두 포함';

  const intro = document.querySelector('#intro-line');
  if (intro) intro.textContent = minContext > 0
    ? '컨텍스트 ' + minContext.toLocaleString('ko-KR') + ' 토큰 이상인 모델만 비교한 결과예요.'
    : '등록한 모든 텍스트 모델 가운데 가장 싼 자동화 비용을 골라 보여 주어요.';

  // 기준 설명(항상 보일 글자 포함)
  const hint = document.querySelector('#context-hint');
  if (hint) {
    hint.textContent = minContext > 0
      ? '작업군별 최저 비용은 컨텍스트 ' + minContext.toLocaleString('ko-KR') + ' 토큰 이상인 모델만 비교해요.'
      : '작업군별 최저 비용은 등록한 모든 텍스트 모델 중에서 비교해요.';
  }
}

// 주간 기록: 오래된 순, 빈 상태 안내
export function renderHistory(list) {
  const tbody = document.querySelector('#history-table tbody');
  while (tbody.children.length) tbody.removeChild(tbody.lastElementChild);
  for (const snap of list) {
    const tr = document.createElement('tr');
    const cells = [snap.asOf, moneyCell(snap.costs.coding), moneyCell(snap.costs.testing), moneyCell(snap.costs.docs), moneyCell(snap.costs.ops)];
    for (let i = 0; i < cells.length; i++) {
      const td = document.createElement('td');
      const c = cells[i];
      if (c && c.el) td.appendChild(c.el);
      else td.textContent = c;
      if (i > 0) td.classList.add('ds-num');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  document.querySelector('#history-table').hidden = list.length === 0;
  document.querySelector('#history-empty').hidden = list.length > 0;
}

// 기준 설정: 선택값 복원
export function renderSettings(minContext) {
  const select = document.querySelector('#min-context-select');
  for (const opt of select.options) {
    if (Number(opt.value) === minContext) { select.value = String(opt.value); break; }
  }
}

// 상태 메시지: 성공이면 초기화, 오류면 한국어 안내
export function renderStatus(message, kind) {
  const el = document.querySelector('#app-status');
  if (!message) {
    el.textContent = '';
    el.className = 'ds-status';
    el.hidden = true;
    return;
  }
  el.textContent = message;
  el.className = kind === 'error' ? 'ds-status ds-status-bad' : 'ds-status ds-status-good';
  el.hidden = false;
}

// 데이터 파일 오류: 표·요약 비우고 안내
export function clearViews() {
  const tbody = document.querySelector('#task-table tbody');
  while (tbody.children.length) tbody.removeChild(tbody.lastElementChild);
  for (const li of document.querySelectorAll('#hf-summary li')) {
    const t = document.createElement('span');
    t.className = 'ds-list-title';
    t.textContent = '—';
    li.textContent = '';
    li.appendChild(t);
  }
  const num = document.querySelector('#answer-num');
  num.textContent = '';
  const textNode = document.createTextNode('—');
  const small = document.createElement('small');
  small.textContent = ' / 작업당';
  num.append(textNode, small);
  document.querySelector('#answer-text').textContent = '데이터를 불러오지 못했어요. "예시로 해 보기"를 누르면 예시 결과로 확인할 수 있어요.';
  const dateEl = document.querySelector('#answer-date');
  if (dateEl) dateEl.textContent = '—';
  const ctxEl = document.querySelector('#answer-ctx');
  if (ctxEl) ctxEl.textContent = minContext > 0 ? minContext.toLocaleString('ko-KR') + ' 토큰 이상' : '모두 포함';
  const intro = document.querySelector('#intro-line');
  if (intro) intro.textContent = '데이터를 불러오지 못했어요. "예시로 해 보기"를 누르면 예시 결과로 확인할 수 있어요.';
}
