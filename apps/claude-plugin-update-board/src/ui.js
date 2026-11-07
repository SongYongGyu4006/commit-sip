import { buildUpdateBoard } from './app.js';

const $ = (sel) => document.querySelector(sel);
const SAMPLE_NOW = '2026-11-03T00:00:00Z';
const SAMPLE = [
  { full_name: 'acme/claude-code-plugins', html_url: 'https://github.com/acme/claude-code-plugins', description: 'Plugin pack for Claude Code', stargazers_count: 120, created_at: '2026-10-26T12:00:00Z', pushed_at: '2026-11-02T06:00:00Z' },
  { full_name: 'bob/claude-statusline', html_url: 'https://github.com/bob/claude-statusline', description: 'Status line for claude code', stargazers_count: 120, created_at: '2026-10-30T00:00:00Z', pushed_at: '2026-11-02T18:00:00Z' },
  { full_name: 'eve/claude-skill-kit', html_url: 'https://github.com/eve/claude-skill-kit', description: 'Claude skills', stargazers_count: 0, created_at: '2026-10-27T00:00:00Z', pushed_at: '2026-11-03T05:00:00Z' }
];
const STATUS_LABEL = { new: '신규', updated: '갱신', new_updated: '신규·갱신', quiet: '조용한 저장소' };

let liveItems = null; // 로드된 data/gh_new_repos.json 의 items
let boardResult = null; // 마지막에 만든 보드 결과

function setStatus(msg, bad = true) {
  const el = $('#app-status');
  if (!msg) { el.textContent = ''; el.hidden = true; el.classList.remove('ds-status-bad'); return; }
  el.textContent = msg; el.hidden = false; el.classList.toggle('ds-status-bad', bad);
}

function fmtDataTime(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(iso)) return '';
  return iso.slice(0, 16).replace('T', ' ');
}

function clearTable() {
  $('#board-body').innerHTML = '';
  $('#summary-line').textContent = '일치: —';
  $('#board-table-wrap').hidden = true;
  $('#board-empty').hidden = false;
}

function renderTable(result, mode) {
  clearTable();
  const filter = $('#status-filter').value;
  const shown = result.items.filter((it) => filter === 'all' || it.status === filter);
  $('#board-table-wrap').hidden = shown.length === 0;
  $('#board-empty').hidden = shown.length > 0;
  for (const it of shown) {
    const tr = document.createElement('tr');
    const cells = [
      ['ds-num ds-rank', '순위', String(it.rank)],
      ['ds-repo', '', null],
      ['ds-desc', '', it.description],
      ['ds-num', '별', String(it.stars)],
      ['ds-num', '하루 평균 별', String(it.starsPerDay)],
      ['ds-status-cell', '상태', null],
      ['ds-updated', '최종 갱신', null]
    ];
    if (it.recency) tr.classList.add('is-fresh');
    for (const [cls, label, txt] of cells) {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      if (label) td.setAttribute('data-label', label);
      if (cls === 'ds-repo') {
        const a = document.createElement('a');
        a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = it.fullName;
        td.appendChild(a);
      } else if (cls === 'ds-status-cell') {
        const span = document.createElement('span');
        span.className = 'ds-badge' + (it.status === 'new_updated' ? ' ds-badge-accent' : '');
        span.textContent = STATUS_LABEL[it.status] || it.status;
        td.appendChild(span);
      } else if (cls === 'ds-updated') {
        if (it.recency) td.textContent = it.updatedDaysAgo + '일 전 업데이트';
      } else if (txt != null) {
        td.textContent = txt;
      }
      tr.appendChild(td);
    }
    $('#board-body').appendChild(tr);
  }
  const numEl = $('#answer-num');
  if (numEl) {
    const n = document.createElement('span'); n.textContent = result.count;
    const s = document.createElement('small'); s.textContent = '개';
    numEl.replaceChildren(n, s);
  }
  const sum = $('#summary-line');
  sum.textContent = mode === 'sample'
    ? `예시 데이터 · 일치: ${result.count} / ${result.total}`
    : `실제 데이터 · 일치: ${result.count} / ${result.total}`;
  const top = result.items[0];
  $('#answer-line').textContent = top
    ? `좋아요. ${mode === 'sample' ? '예시 ' : '실제 데이터 기준, '}${'이번 주 새 Claude 저장소 ' + result.count + '개 · 1위 ' + top.fullName + ' (별 ' + top.stars + ')'}`
    : '좋아요. Claude 관련 저장소가 아직 없어요. 「예시로 해 보기」로 예시 3개를 볼 수 있어요.';
  const meta = $('#answer-meta');
  meta.innerHTML = '';
  if (top) {
    const avg = Math.round((result.items.reduce((s, x) => s + x.starsPerDay, 0) / result.items.length) * 10) / 10;
    const rows = [
      ['1위 하루 평균 별', `하루 ${top.starsPerDay}개`],
      ['전체 평균', `하루 ${avg}개`],
      ['최근 3일 내 갱신', `${result.items.filter((x) => x.recency).length}개`]
    ];
    for (const [dt, dd] of rows) {
      const d = document.createElement('div');
      const l = document.createElement('dt'); l.textContent = dt;
      const v = document.createElement('dd'); v.textContent = dd;
      d.appendChild(l); d.appendChild(v);
      meta.appendChild(d);
    }
  }
}

function runBoard(rows, nowIso, mode) {
  let result;
  try {
    result = buildUpdateBoard(rows, nowIso);
  } catch (e) {
    clearTable();
    setStatus('데이터 형식이 올바르지 않아 보드를 만들지 못했어요. ' + (e.message || ''));
    return;
  }
  boardResult = result;
  setStatus('');
  renderTable(result, mode);
  if (result.count === 0) setStatus('Claude 관련 저장소가 없습니다.');
}

function showLive() {
  if (!liveItems) { setStatus('실제 데이터가 아직 없어요. 데이터 파일을 불러오지 못했습니다. 페이지를 다시 열거나 「예시로 해 보기」로 예시를 보실 수 있어요.'); return; }
  runBoard(liveItems, new Date().toISOString().slice(0, 19) + 'Z', 'live');
}

async function loadData() {
  const [reposRes, metaRes] = await Promise.allSettled([
    fetch('data/gh_new_repos.json'),
    fetch('data/gh_new_repos.meta.json')
  ]);
  const ok = (r) => r.status === 'fulfilled' && r.value.ok;
  if (!ok(reposRes) || !ok(metaRes)) { setStatus('데이터 파일을 불러오지 못했습니다.'); return; }
  let repos, meta;
  try {
    repos = await reposRes.value.json();
    meta = await metaRes.value.json();
  } catch { setStatus('데이터 파일을 불러오지 못했습니다.'); return; }
  if (!Array.isArray(repos.items)) { setStatus('데이터 파일을 불러오지 못했습니다.'); return; }
  liveItems = repos.items;
  const t = fmtDataTime(meta.fetched_at);
  if (t) $('#data-time').textContent = '데이터 기준: ' + t;
  const terms = typeof meta.terms === 'string' ? meta.terms : '';
  $('#data-source').textContent = terms.toLowerCase().startsWith('github api') ? terms : 'GitHub API · ' + terms;
}

window.addEventListener('DOMContentLoaded', () => {
  const filter = $('#status-filter');
  filter.addEventListener('change', () => { if (boardResult) renderTable(boardResult, 'live'); });
  $('#sample-button').addEventListener('click', () => {
    filter.value = 'all';
    runBoard(SAMPLE, SAMPLE_NOW, 'sample');
  });
  $('#reload-button').addEventListener('click', showLive);
  $('#reset-button').addEventListener('click', () => {
    filter.value = 'all'; setStatus('');
    if (liveItems) showLive();
  });
  loadData().then(() => {
    if (liveItems) showLive();
    else runBoard(SAMPLE, SAMPLE_NOW, 'sample'); // 실제 데이터를 못 읽었을 때만 예시로 채움
  });
});
