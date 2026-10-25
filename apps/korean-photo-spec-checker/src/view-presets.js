// 제출처 규격표 화면: 한국 주요 제출처별 규격 비교표 렌더링,
// '적용' 버튼으로 작업 화면을 즉시 전환.
import { getPresets, formatSpecSummary } from './presets.js';

let initialized = false;

function fmtMaxBytes(b) {
  const ki = b / 1024;
  const unit = b % 1048576 === 0 ? b / 1048576 + 'MB' : ki + 'KiB';
  return unit + ' 이하';
}

export function renderPresetsView() {
  const tbody = document.querySelector('#presets-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const p of getPresets()) {
    const tr = document.createElement('tr');
    if (p.id === 'custom') tr.hidden = true;

    const tdName = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = p.label;
    tdName.appendChild(strong);

    const tdSize = document.createElement('td');
    tdSize.className = 'ds-num';
    tdSize.textContent = p.targetWidth + '×' + p.targetHeight;

    const tdRatio = document.createElement('td');
    tdRatio.className = 'ds-num';
    tdRatio.textContent = p.ratioW + ':' + p.ratioH;

    const tdMax = document.createElement('td');
    tdMax.className = 'ds-num';
    tdMax.textContent = fmtMaxBytes(p.maxBytes);

    const tdExt = document.createElement('td');
    tdExt.textContent = p.requiredExt.replace('.', '').toUpperCase();

    const tdSrc = document.createElement('td');
    if (p.sourceUrl) {
      const a = document.createElement('a');
      a.href = p.sourceUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '공식 안내';
      tdSrc.appendChild(a);
    } else {
      tdSrc.textContent = '직접 입력';
    }

    const tdDate = document.createElement('td');
    tdDate.textContent = p.verifiedDate || '—';

    const tdAct = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ds-btn ds-btn-ghost';
    btn.textContent = '적용';
    btn.dataset.preset = p.id;
    tdAct.appendChild(btn);

    tr.append(tdName, tdSize, tdRatio, tdMax, tdExt, tdSrc, tdDate, tdAct);
    tbody.appendChild(tr);
  }
}

export function initPresetsView() {
  if (initialized) return;
  initialized = true;
  renderPresetsView();
  const tbody = document.querySelector('#presets-table tbody');
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-preset]');
    if (!btn) return;
    // main.js 가 등록한 핸들러로 프리셋 선택 + 화면 전환
    if (window.__kbshrinkSelectPreset) window.__kbshrinkSelectPreset(btn.dataset.preset, true);
  });
}
