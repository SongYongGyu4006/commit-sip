// KoFilePDF — 문서 합치기 화면(#screen-make): 파일 목록 편집, 계획 표시, 예시 자동 실행,
// 최대 6회 재시도 PDF 생성, 초기화, 외부 요청 수, 오류 안내(#app-status).
import { planPdf, parseTargetMb } from './app.js';
import { decodeImageFile, createExampleFiles, writePdf } from './pdf.js';
import { loadState, saveState, clearState } from './storage.js';
import { renderHistory } from './history-ui.js';

const MB = 1048576;
let building = false;

const $ = (id) => document.getElementById(id);
const statusEl = () => $('app-status');
const setStatus = (msg) => {
  const el = statusEl();
  el.textContent = msg || '';
  el.classList.toggle('ds-status-bad', !!msg);
  el.classList.toggle('ds-status-good', !msg);
};
const clearResult = () => {
  $('plan-json').textContent = '';
  $('size-result').textContent = '';
  const link = $('download-link');
  if (link) {
    link.hidden = true;
    if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
  }
};

// 외부 요청 수: http(s) 리소스 중 이 페이지 호스트와 다른 도메인 개수(file:// 에서 열면 0).
function updateNetCheck() {
  const el = $('net-check');
  if (!el) return;
  const host = location.host;
  const n = performance
    .getEntriesByType('resource')
    .filter((e) => (e.name || '').startsWith('http') && new URL(e.name).host !== host).length;
  el.textContent = 'external requests: ' + n;
}

// 파일 목록을 {label, items} 형태로 유지: label은 'files'(선택 파일) 또는 'example'(예시).
let items = [];
let label = 'files';

function addItem(it) {
  items.push(it);
  if (items.length > 1) label = 'files';
}

// 계획 요약을 답 카드에: 파일이 없으면 예시 값(예시 3장과 목표 5MB), 있으면 실제 계획.
function refreshAnswer(plan) {
  const big = $('answer-num');
  const text = $('answer-text');
  const meta = [
    ['사진', (plan ? plan.pageCount : 3) + '장'],
    ['목표', (parseTargetMb($('target-mb').value) ?? 5) + 'MB'],
    ['원본', ((plan ? plan.totalBytes : 12209036) / MB).toFixed(2) + 'MB']
  ];
  if (big) big.textContent = plan ? plan.pageCount + '장' : '3장(예시)';
  if (text)
    text.textContent = plan
      ? '목표 ' + (parseTargetMb($('target-mb').value) ?? 5) + 'MB에 맞춰 A4 ' + plan.pageCount + '페이지 PDF를 만들 준비가 돼요.'
      : '예시 사진 3장을 올려 보면 바로 결과로 보여 드려요.';
  const dl = $('answer-meta');
  if (dl) {
    dl.textContent = '';
    for (const [dt, dd] of meta) {
      const div = document.createElement('div');
      const d1 = document.createElement('dt');
      d1.textContent = dt;
      const d2 = document.createElement('dd');
      d2.textContent = dd;
      div.appendChild(d1);
      div.appendChild(d2);
      dl.appendChild(div);
    }
  }
}

// 목록과 목표 용량에 맞는 계획을 계산해 pre#plan-json 과 답 카드에 표시.
// 목록이 비었거나 목표 용량이 잘못된 값이면 계획은 비우고 상태 영역에 안내를 띄운다.
function refreshPlan() {
  const targetText = $('target-mb').value;
  const targetMb = parseTargetMb(targetText);
  let plan = null;
  if (items.length === 0) {
    $('plan-json').textContent = '';
    setStatus(''); // 빈 목록은 상태 영역이 아니라 사진 목록 카드의 안내로 표현
  } else if (targetMb === null) {
    $('plan-json').textContent = '';
    setStatus('목표 용량이 올바르지 않아요. 0보다 크고 100 이하 숫자(예: 5)를 넣어 주세요.');
  } else {
    try {
      plan = planPdf(items.map((it) => ({ name: it.name, width: it.width, height: it.height, bytes: it.bytes })), targetMb);
      $('plan-json').textContent = JSON.stringify(plan);
      setStatus(''); // 계획이 잘 나왔으면 성공
    } catch (e) {
      $('plan-json').textContent = '';
      setStatus('계획을 세우지 못했어요. ' + e.message);
    }
  }
  refreshAnswer(plan);
  updateNetCheck();
  return plan;
}

function renderFileList() {
  const ul = $('file-list');
  ul.textContent = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'ds-empty';
    li.textContent = '사진이 아직 없어요. 파일 고르기로 JPG·PNG 사진을 올리거나, 예시로 해 보기를 누르면 바로 결과가 나옵니다.';
    ul.appendChild(li);
    return;
  }
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = it.name;
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = it.width + ' x ' + it.height + 'px · ' + (it.bytes / 1024).toFixed(1) + 'KB';
    main.appendChild(title);
    main.appendChild(sub);
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const mkBtn = (cls, text, fn, disabled) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ds-btn ' + cls;
      b.textContent = text;
      if (disabled) b.disabled = true;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    end.appendChild(mkBtn('up-button', '위로', () => {
      if (i === 0) return;
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
      renderFileList();
      refreshPlan();
    }, i === 0));
    end.appendChild(mkBtn('down-button', '아래로', () => {
      if (i === items.length - 1) return;
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
      renderFileList();
      refreshPlan();
    }, i === items.length - 1));
    end.appendChild(mkBtn('remove-button', '지우기', () => {
      items.splice(i, 1);
      renderFileList();
      refreshPlan();
    }, false));
    li.appendChild(main);
    li.appendChild(end);
    ul.appendChild(li);
  });
}

async function addFiles(fileList) {
  let rejected = 0;
  for (const f of fileList) {
    try {
      const it = await decodeImageFile(f);
      addItem(it);
    } catch {
      rejected++;
    }
  }
  renderFileList();
  refreshPlan();
  if (rejected > 0)
    setStatus(
      '이미지를 읽지 못한 파일 ' + rejected + '개는 건너뛰었어요. JPG 또는 PNG 파일인지 확인해 주세요.'
    );
  else if (items.length > 0) setStatus(''); // 성공한 변경은 상태를 지운다
}

// PDF 생성: 계획(초기 scale/quality)으로 렌더링 → 실제 크기 확인 → 초과 시 targetMb*0.8 로
// 재계획하면서 최대 6회 재시도. 재시도 계획이 실행 불가능하면 멈춘다.
async function build(labelArg) {
  if (building) return;
  const targetText = $('target-mb').value;
  const targetMb = parseTargetMb(targetText);
  if (items.length === 0) {
    // 빈 목록은 사진 목록 카드 안내가 역할을 하므로 상태 영역은 조용히 둔다.
    setStatus('');
    return;
  }
  if (targetMb === null) {
    setStatus('목표 용량이 올바르지 않아요. 0보다 크고 100 이하 숫자(예: 5)를 넣어 주세요.');
    return;
  }
  let plan;
  try {
    plan = planPdf(items.map((it) => ({ name: it.name, width: it.width, height: it.height, bytes: it.bytes })), targetMb);
  } catch (e) {
    handleAppError('계획 계산에 실패했어요. ' + e.message);
    return;
  }
  if (!plan.feasible) {
    setStatus('목표 ' + targetMb + 'MB를 만들 수 없을 것 같아요. 가장 많이 줄여도 목표가 넘습니다. 목표 용량을 키우거나 사진을 줄여 보세요.');
    clearResult();
    $('plan-json').textContent = JSON.stringify(plan);
    return;
  }
  building = true;
  setStatus('PDF를 만들고 있어요…');
  const startMb = targetMb;
  let curMb = targetMb;
  let curPlan = plan;
  let retries = 0;
  let blob = null;
  try {
    for (;;) {
      blob = await writePdf(items, curPlan, curPlan.quality);
      if (blob.size <= curPlan.targetBytes || retries >= 6) break;
      const nextMb = curMb * 0.8;
      let nextPlan;
      try {
        nextPlan = planPdf(
          items.map((it) => ({ name: it.name, width: it.width, height: it.height, bytes: it.bytes })),
          nextMb
        );
      } catch {
        break; // 재시도 계획이 유효하지 않으면 중단
      }
      if (!nextPlan.feasible) break; // 재시도 계획이 실행 불가능하면 중단
      curMb = nextMb;
      curPlan = nextPlan;
      retries++;
    }
  } catch (e) {
    handleAppError('PDF 만들기에 실패했어요. ' + e.message);
    building = false;
    return;
  }
  building = false;
  const ok = blob.size <= curPlan.targetBytes;
  $('size-result').textContent =
    '원본 ' + (curPlan.totalBytes / MB).toFixed(2) + 'MB → 최종 ' + (blob.size / MB).toFixed(2) +
    'MB / 목표 ' + curPlan.targetBytes / MB + 'MB · ' +
    (ok ? '성공: 목표 이하' : '실패: 목표 초과');
  const link = $('download-link');
  if (ok) {
    if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
    link.href = URL.createObjectURL(blob);
    link.hidden = false;
    setStatus(''); // 성공
  } else {
    link.hidden = true;
    setStatus('최종 파일이 목표보다 커요. 목표 용량을 키우거나 사진을 줄여서 다시 만들어 보세요.');
  }
  // 기록 추가(최신순, 최대 20)
  const st = loadState();
  st.history.unshift({ label: labelArg, pageCount: curPlan.pageCount, targetMb: curPlan.targetBytes / MB, finalBytes: blob.size, ok });
  st.history = st.history.slice(0, 20);
  const err = saveState(st);
  if (err) setStatus(err);
  else if (ok) setStatus('');
}

// 예시로 해 보기: 목록을 3장 예시로 바꾼 뒤 자동 생성. 목표 용량이 잘못된 값이면 '5'로 정한다.
async function runExample() {
  if (building) return;
  try {
    if (parseTargetMb($('target-mb').value) === null) $('target-mb').value = '5';
    const ex = await createExampleFiles();
    items = ex;
    label = 'example';
    renderFileList();
    refreshPlan();
    await build('example');
  } catch (e) {
    handleAppError('예시를 만들지 못했어요. ' + e.message);
  }
}

// 오류 안내: 상태 영역에 한국어 메시지 + 결과/다운로드 비활성. 목록과 저장 데이터는 그대로.
export function handleAppError(msg) {
  setStatus(msg || '문제가 생겼어요. 한 번 더 시도해 주세요.');
  clearResult();
}

// 초기화: 목록·목표 용량·기록·저장 데이터·결과·다운로드·상태를 모두 비운다.
function resetAll() {
  if (!window.confirm('모든 사진 목록과 설정·기록을 지울까요? 다시 만들 수 없어요.')) return;
  items = [];
  label = 'files';
  clearState();
  renderFileList();
  $('target-mb').value = '5';
  clearResult();
  setStatus('');
  refreshAnswer(null);
  renderHistory();
  updateNetCheck();
}

// 저장된 상태(목표 용량·기록)로 화면을 동기화한다. 새로고침과 가져오기 이후에 호출.
export function syncFromStorage() {
  const st = loadState();
  if (st.targetMb !== '' && parseTargetMb(st.targetMb) !== null) $('target-mb').value = st.targetMb;
  else if (parseTargetMb($('target-mb').value) === null) $('target-mb').value = '5';
  renderHistory();
  refreshPlan();
}

export function initMakeScreen() {
  $('target-mb').addEventListener('input', () => {
    const v = $('target-mb').value;
    if (parseTargetMb(v) !== null) {
      const st = loadState();
      if (st.targetMb !== v) {
        st.targetMb = v;
        saveState(st); // 성공한 변경을 저장하고 상태 안내는 refreshPlan 이 지운다
      }
    }
    refreshPlan();
  });
  $('file-input').addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) addFiles([...e.target.files]);
    e.target.value = '';
  });
  $('example-button').addEventListener('click', runExample);
  $('build-button').addEventListener('click', () => build(label));
  $('reset-button').addEventListener('click', resetAll);
  renderFileList();
  refreshPlan();
}
