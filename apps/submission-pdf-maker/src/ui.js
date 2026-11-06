// KoFilePDF — 문서 합치기 화면(#screen-make): 파일 목록 편집, 계획 표시, 예시 자동 실행,
// 최대 6회 재시도 PDF 생성, 초기화, 외부 요청 수(#net-check)와 오류 안내(#app-status).
import { planPdf, parseTargetMb } from './app.js';
import { decodeImageFile, createExampleFiles, writePdf } from './pdf.js';
import { loadState, saveState, clearState } from './storage.js';

const MB = 1048576; // 1MB(시바이트)
const MB1 = 1e6; // 화면 표시용: 1,000,000바이트

let list = []; // {name, width, height, bytes, blob}
let targetMb = 5;
let url = null; // 마지막 성공 PDF 의 object URL
let busy = false;

function $(id) { return document.getElementById(id); }
const el = {
  fileInput: () => $('file-input'),
  bandFileInput: () => $('band-file-input'),
  targetMb: () => $('target-mb'),
  fileList: () => $('file-list'),
  planPages: () => $('plan-pages'),
  planJson: () => $('plan-json'),
  targetHint: () => $('target-mb-hint'),
  sizeResult: () => $('size-result'),
  download: () => $('download-link'),
  appStatus: () => $('app-status'),
  netCheck: () => $('net-check'),
  answerLabel: () => $('answer-label'),
  answerNum: () => $('answer-num'),
  answerText: () => $('answer-text'),
  answerMeta: () => $('answer-meta')
};

// ---------- 상태 안내: 오류와 진행 알림에만 쓴다. 성공(변경) 시엔 비운다. ----------
export function handleAppError(text) {
  const s = el.appStatus();
  if (!s) return;
  s.textContent = text;
  s.classList.toggle('ds-status-bad', Boolean(text));
}

// ---------- 외부 요청 수: http(s) 중 이 도메인과 다른 호스트만 센다. file:// 면 0. ----------
function updateNetCheck() {
  const n = el.netCheck();
  if (!n) return;
  let count = 0;
  try {
    for (const r of performance.getEntriesByType('resource')) {
      const urlStr = r.name || '';
      if (/^https?:/i.test(urlStr)) {
        try {
          const host = new URL(urlStr).host;
          if (host && host !== location.host) count++;
        } catch { /* 상대 주소 등: 무시 */ }
      }
    }
  } catch { /* performance API 없을 수 있음 */ }
  n.textContent = 'external requests: ' + count;
}

// ---------- 계획: 리스트가 비거나 목표 용량이 잘못된 걸로 판단할 때 null ----------
function currentPlan() {
  if (!list.length) return null;
  const t = parseTargetMb(el.targetMb().value);
  if (t === null) return null;
  return planPdf(list.map(({ name, width, height, bytes }) => ({ name, width, height, bytes })), t);
}

// ---------- 목록 렌더: 이름 · 픽셀 · KB + 위로/아래로/지우기 ----------
function renderFileList() {
  const ul = el.fileList();
  if (!ul) return;
  ul.textContent = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'ds-empty';
    li.textContent = '아직 올린 사진이 없어요. 파일 고르기로 올리거나 예시로 해 보기를 눌러 보세요.';
    ul.appendChild(li);
    return;
  }
  list.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'ds-list-item';

    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = f.name;
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = f.width + '×' + f.height + 'px · ' + Math.max(1, Math.round(f.bytes / 1024)) + 'KB';
    main.append(title, sub);

    const btns = document.createElement('div');
    btns.className = 'file-btns';
    const mk = (cls, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', () => fn(i));
      return b;
    };
    btns.appendChild(mk('ds-btn up-button', '위로', (i) => {
      if (i === 0) return;
      [list[i - 1], list[i]] = [list[i], list[i - 1]];
      afterChange();
    }));
    btns.appendChild(mk('ds-btn down-button', '아래로', (i) => {
      if (i === list.length - 1) return;
      [list[i + 1], list[i]] = [list[i], list[i + 1]];
      afterChange();
    }));
    btns.appendChild(mk('ds-btn remove-button', '지우기', (i) => {
      list.splice(i, 1);
      afterChange();
    }));

    li.append(main, btns);
    ul.appendChild(li);
  });
}

// ---------- 답 카드: 사진 N장 + 목표 + 원본. 완성 후에는 최종 PDF 용량이 가장 커진다. ----------
function refreshAnswer(finalInfo) {
  const label = el.answerLabel(), num = el.answerNum(), text = el.answerText(), meta = el.answerMeta();
  if (!label || !num || !text || !meta) return;
  const n = list.length;
  const target = el.targetMb().value;

  if (finalInfo) {
    label.textContent = '완성된 PDF';
    num.textContent = finalInfo.finalMb.toFixed(2) + 'MB';
    const pct = Math.round((1 - finalInfo.finalBytes / finalInfo.totalBytes) * 100);
    if (finalInfo.ok) {
      text.textContent = finalInfo.pageCount + '장 · 목표 ' + target + 'MB 이하 · 원본 ' + finalInfo.totalMb.toFixed(2) + 'MB에서 ' + Math.max(0, pct) + '% 줄었어요.';
    } else {
      text.textContent = finalInfo.pageCount + '장 · 목표 ' + target + 'MB를 넘었어요. 더 작은 용량으로 다시 시도해 보세요.';
    }
  } else if (n === 0) {
    label.textContent = '다음 PDF';
    num.textContent = '0장';
    text.textContent = '사진을 고르면 A4 PDF 하나로 합쳐 드려요. 바로 아래에서 시작해 보세요.';
  } else {
    label.textContent = '다음 PDF';
    num.textContent = n + '장';
    const totalMb = (list.reduce((s, f) => s + f.bytes, 0) / MB1).toFixed(2);
    text.textContent = '원본 ' + totalMb + 'MB를 A4 ' + n + '장의 PDF로, 목표 ' + target + 'MB 이하에 맞춰 드려요.';
  }

  meta.textContent = '';
  const totalMb = list.length ? (list.reduce((s, f) => s + f.bytes, 0) / MB1).toFixed(2) + 'MB' : '—';
  for (const [dt, dd] of [['사진', n + '장'], ['목표', target + 'MB 이하'], ['원본', totalMb]]) {
    const div = document.createElement('div');
    const d = document.createElement('dt');
    d.textContent = dt;
    const v = document.createElement('dd');
    v.textContent = dd;
    div.append(d, v);
    meta.appendChild(div);
  }
}

// ---------- 계획 표시: JSON(pre#plan-json)과 목록. 빈 상태에선 둘 다 비운다. ----------
function refreshPlan() {
  const plan = currentPlan();
  const pre = el.planJson();
  if (pre) {
    if (plan) {
      pre.textContent = JSON.stringify(plan);
    } else {
      pre.textContent = '';
    }
  }
  // 빈 상태 안내는 각각의 칸(목표 용량 안내, 사진 목록)이 맡는다. 상태 채널은 오류와 진행에만 쓴다.
  if (el.targetHint()) el.targetHint().hidden = plan !== null;
  if (el.sizeResult()) el.sizeResult().textContent = '';
  if (el.download()) { el.download().hidden = true; if (url) { URL.revokeObjectURL(url); url = null; } }
  renderFileList();
  renderPlanPages(plan);
  refreshAnswer();
}

// ---------- 계획 페이지: 한국어 한 줄 목록. 일반인은 읽기 쉽게, JSON 은 자세히 접어 둔다. ----------
function renderPlanPages(plan) {
  const ul = el.planPages();
  if (!ul) return;
  ul.textContent = '';
  if (!plan) return;
  if (plan.action !== 'keep') {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = '원본이 목표보다 커서 줄여 넣어요';
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = '사진을 최대 ' + Math.round(plan.scale * 100) + '% 크기로, 화질 ' + Math.round(plan.quality * 100) + '% 로 저장';
    main.append(title, sub);
    ul.appendChild(li);
  }
  for (const p of plan.pages) {
    const li = document.createElement('li');
    li.className = 'ds-list-item';
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = p.index + '. ' + p.name + ' · A4 한 장';
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = p.outWidthPx + '×' + p.outHeightPx + 'px로 저장';
    main.append(title, sub);
    ul.appendChild(li);
  }
}

// 리스트·목표가 바뀐 뒤의 공통 흐름. 성공한 변경이라 상태 안내는 지운다.
function afterChange() {
  refreshPlan();
  handleAppError('');
  saveState({ targetMb: el.targetMb().value, history: loadState().history });
}

// ---------- 파일 추가: 디코딩해 픽셀을 읽고 목록에 덧붙는다. ----------
async function addFiles(fileList) {
  for (const file of fileList) {
    try {
      const f = await decodeImageFile(file);
      list.push(f);
    } catch {
      handleAppError(file.name + ' 을(를) 읽지 못했어요. JPG·PNG 파일인지 확인해 주세요.');
    }
  }
  el.fileInput().value = '';
  if (list.length) afterChange();
  else { refreshPlan(); }
}

// ---------- PDF 생성: 계획 → 캔버스 → JPEG → PDF, 목표 초과면 최대 6회 재시도 ----------
async function build(label) {
  if (busy) return;
  if (!list.length) {
    handleAppError('사진이 하나도 없어요. 파일을 고르거나 예시로 해 보기를 눌러 주세요.');
    return;
  }
  const target = parseTargetMb(el.targetMb().value);
  if (target === null) {
    handleAppError('목표 용량이 올바르지 않아요. 0보다 크고 100 이하 숫자(예: 5)를 넣어 주세요.');
    return;
  }
  busy = true;
  handleAppError('PDF를 만들고 있어요. 잠시만 기다려 주세요.');
  let plan;
  try {
    plan = planPdf(list.map(({ name, width, height, bytes }) => ({ name, width, height, bytes })), target);
  } catch (err) {
    handleAppError('계획을 세우지 못했어요. 다시 시도해 주세요.');
    busy = false;
    return;
  }
  if (!plan.feasible) {
    handleAppError('원본이 너무 커요. 최소 압축으로 만들어도 목표 ' + target + 'MB 를 넘을 것 같아서 만들지 않았어요. 더 작은 목표를 넣어 주세요.');
    busy = false;
    return;
  }
  let t = target;
  let pdf = null;
  for (let i = 0; i <= 6; i++) {
    const p = planPdf(list.map(({ name, width, height, bytes }) => ({ name, width, height, bytes })), t);
    if (i > 0 && !p.feasible) break;
    pdf = await writePdf(list, p, p.quality);
    if (pdf.size <= plan.targetBytes) break;
    if (i === 6) break;
    t = t * 0.8;
  }
  const finalMb = pdf.size / MB1;
  const ok = pdf.size <= plan.targetBytes;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(pdf);
  const a = el.download();
  if (ok) {
    a.href = url;
    a.hidden = false;
    el.sizeResult().textContent =
      '원본 ' + (plan.totalBytes / MB1).toFixed(2) + 'MB → 결과 ' + finalMb.toFixed(2) + 'MB (목표 ' + target + 'MB) · 성공: 목표 이하예요.';
    handleAppError('');
  } else {
    a.hidden = true;
    el.sizeResult().textContent =
      '원본 ' + (plan.totalBytes / MB1).toFixed(2) + 'MB → 결과 ' + finalMb.toFixed(2) + 'MB (목표 ' + target + 'MB) · 실패: 여전히 목표 초과예요.';
    handleAppError('목표 ' + target + 'MB 를 넘었어요. 더 작은 목표(예: ' + Math.max(0.1, +(target * 0.8).toFixed(1)) + ')로 다시 만들어 보세요.');
  }
  refreshAnswer({ ok, pageCount: plan.pageCount, totalBytes: plan.totalBytes, totalMb: plan.totalBytes / MB1, finalBytes: pdf.size, finalMb });
  const st = loadState();
  st.history = [{ label, pageCount: plan.pageCount, targetMb: target, finalBytes: pdf.size, ok }, ...st.history].slice(0, 20);
  saveState(st);
  busy = false;
  updateNetCheck();
}

// ---------- '예시로 해 보기': 예시 3장으로 대체해 바로 만든다. ----------
async function runExample() {
  if (busy) return;
  if (parseTargetMb(el.targetMb().value) === null) el.targetMb().value = '5';
  const files = await createExampleFiles();
  list = files;
  renderFileList();
  refreshPlan();
  handleAppError('');
  saveState({ targetMb: el.targetMb().value, history: loadState().history });
  await build('example');
}

// ---------- 초기화 ----------
function reset() {
  list = [];
  el.targetMb().value = '5';
  if (url) { URL.revokeObjectURL(url); url = null; }
  clearState();
  renderFileList();
  if (el.planPages()) el.planPages().textContent = '';
  el.planJson().textContent = '';
  el.sizeResult().textContent = '';
  el.download().hidden = true;
  el.download().href = '';
  handleAppError('');
  refreshAnswer();
  updateNetCheck();
}

// ---------- 초기화: 저장된 목표 용량 복원 + 이벤트 연결 ----------
export function initMakeScreen() {
  const st = loadState();
  targetMb = Number(st.targetMb);
  if (el.targetMb()) el.targetMb().value = st.targetMb;

  // 상단 띠와 화면 안 파일 고르기는 같은 동작. 같은 id 를 쓰면 getElementById 가 하나만 찾는다.
  for (const inp of [el.fileInput(), el.bandFileInput()]) {
    if (inp) inp.addEventListener('change', (e) => addFiles(e.target.files));
  }
  el.targetMb().addEventListener('input', afterChange);
  $('example-button').addEventListener('click', runExample);
  const bandExample = $('band-example-button');
  if (bandExample) bandExample.addEventListener('click', runExample);
  $('build-button').addEventListener('click', () => build('files'));
  $('reset-button').addEventListener('click', reset);

  // 끌어 놓기
  const make = $('screen-make');
  make.addEventListener('dragover', (e) => { e.preventDefault(); });
  make.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  updateNetCheck();
  refreshPlan();
  handleAppError('');
}

// 목표 용량·기록을 저장 상태에서 화면으로 동기화(가져오기·기록 비우기 뒤).
export function syncFromStorage() {
  const st = loadState();
  if (el.targetMb()) el.targetMb().value = st.targetMb;
  targetMb = Number(st.targetMb);
  refreshPlan();
  handleAppError('');
}
