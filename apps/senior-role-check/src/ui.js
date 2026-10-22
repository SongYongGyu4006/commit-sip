// 시니어 역할 점검 — 화면 제어 모듈
// 순수 로직(app.js)과 DOM 사이를 잇는 유일한 모듈이다.
// 화면의 모든 출력은 textContent 만으로 수행하며, localStorage 등
// 어떤 저장소에도 쓰지 않는다.

import { assessSeniorRole, isImportableResult } from './app.js';

// ── 요소 참조 ─────────────────────────────────────────
const els = {
  input: document.getElementById('profile-input'),
  assess: document.getElementById('assess-button'),
  example: document.getElementById('example-button'),
  reset: document.getElementById('reset-button'),
  export: document.getElementById('export-button'),
  importFile: document.getElementById('import-file'),
  strengths: document.getElementById('strengths-list'),
  gaps: document.getElementById('gaps-list'),
  strengthsCount: document.getElementById('strengths-count'),
  gapsCount: document.getElementById('gaps-count'),
  strengthsEmpty: document.getElementById('strengths-empty'),
  gapsEmpty: document.getElementById('gaps-empty'),
  direction: document.getElementById('direction-output'),
  status: document.getElementById('app-status'),
};

// "general"을 사람이 읽기 좋게 보여주는 라벨
const STRENGTH_LABELS = {
  design: '디자인',
  architecture: '아키텍처',
  code: '코딩',
  review: '코드 리뷰',
  mentor: '멘토링',
  scale: '규모 확장',
  refactor: '리팩터링',
  test: '테스트',
  security: '보안',
  performance: '성능',
  team: '팀',
  lead: '리드',
  manage: '관리',
  ship: '출시',
  deploy: '배포',
  general: '전반적 경험',
};

// 진행 방향은 내부 값(specialist / generalist / lead) 그대로이지만,
// 화면에는 한국어로 표시한다.
const DIRECTION_LABELS = {
  lead: '리더',
  specialist: '전문화',
  generalist: '일반',
};

// 결과 객체를 화면에 그린다. (리셋/초기화는 result = null 로 호출)
function render(result) {
  // 목록
  els.strengths.textContent = '';
  els.gaps.textContent = '';
  els.strengthsCount.textContent = '';
  els.gapsCount.textContent = '';
  els.direction.textContent = '';

  if (!result) {
    els.strengthsEmpty.hidden = false;
    els.gapsEmpty.hidden = false;
    return;
  }

  els.strengthsEmpty.hidden = true;
  els.gapsEmpty.hidden = true;

  for (const entry of result.strengths) {
    const li = document.createElement('li');
    li.textContent = STRENGTH_LABELS[entry] || '전반적 경험';
    els.strengths.appendChild(li);
  }
  for (const entry of result.gaps) {
    const li = document.createElement('li');
    li.textContent = STRENGTH_LABELS[entry] || '전반적 경험';
    els.gaps.appendChild(li);
  }

  els.strengthsCount.textContent = String(result.strengths.length);
  els.gapsCount.textContent = String(result.gaps.length);
  els.direction.textContent = DIRECTION_LABELS[result.direction] || result.direction;
}

// 상태 영역: 오류/성공 메시지. 빈 문자열이면 지운다.
function setStatus(message, isError = true) {
  els.status.textContent = message;
  els.status.className = 'status' + (message ? (isError ? ' error' : ' ok') : '');
}

// 성공한 점검 결과를 보관한다. (내보낼 때 사용)
let lastResult = null;

// ── 점검하기 ─────────────────────────────────────────
function runAssess() {
  const text = els.input.value;
  let result;
  try {
    result = assessSeniorRole(text);
  } catch (err) {
    if (err instanceof RangeError) {
      if (text.trim().length === 0) {
        setStatus('이력 텍스트가 비어 있습니다. 내용을 입력한 뒤 다시 시도해 주세요.');
      } else {
        setStatus('이력 텍스트가 너무 깁니다. 20,000자 이하로 줄인 뒤 다시 시도해 주세요.');
      }
    } else {
      setStatus('문제를 확인할 수 없습니다. 다시 시도해 주세요.');
    }
    return; // 기존 결과는 그대로 유지
  }
  lastResult = result;
  setStatus('');
  render(result);
}

// ── 예시로 해 보기 ───────────────────────────────────
// 한국어 사용자도 "내 이력"처럼 체감할 수 있도록 한국어 예시를 사용한다.
// 샘플 파일: app/samples/resume-korean.txt
const EXAMPLE_TEXT =
  '2012~2025 제조업 IT팀. Java로 백엔드 개발, 코드 리뷰 200건 이상, 클라우드 아키텍처 설계, ' +
  '보안·성능 최적화, 5명 팀 리드, 주니어 멘토링, 배포·확장 담당.';

function runExample() {
  els.input.value = EXAMPLE_TEXT;
  runAssess();
}

// ── 초기화 ───────────────────────────────────────────
function runReset() {
  els.input.value = '';
  lastResult = null;
  setStatus('');
  render(null);
}

// ── JSON 내보내기 ────────────────────────────────────
function runExport() {
  if (!lastResult) {
    setStatus('아직 성공한 점검 결과가 없습니다. 먼저 점검하기를 눌러 주세요.');
    return;
  }
  const json = JSON.stringify(lastResult);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'role-check.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('');
}

// ── JSON 불러오기 ────────────────────────────────────
function onImportChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch {
      setStatus('파일을 읽을 수 없습니다. JSON 형식이 올바른지 확인해 주세요.');
      return;
    }
    if (!isImportableResult(parsed)) {
      setStatus(
        '이 파일은 이 앱의 결과 형식과 다릅니다. ' +
        'role-check.json 형식( strengths · gaps · direction )인 파일을 선택해 주세요.'
      );
      return;
    }
    lastResult = parsed;
    setStatus('');
    render(parsed);
  };
  reader.readAsText(file);
  // 같은 파일을 다시 선택해도 이벤트가 다시 오도록
  event.target.value = '';
}

// ── 연결 ─────────────────────────────────────────────
els.assess.addEventListener('click', runAssess);
els.example.addEventListener('click', runExample);
els.reset.addEventListener('click', runReset);
els.export.addEventListener('click', runExport);
els.importFile.addEventListener('change', onImportChange);
