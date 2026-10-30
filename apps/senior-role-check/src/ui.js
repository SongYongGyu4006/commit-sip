// 시니어 역량 점검 — 화면 제어 모듈
// 순수 로직(app.js)과 DOM 사이를 잇는 유일한 모듈이다.
// 화면의 모든 출력은 textContent 만으로 수행하며, localStorage 등
// 어떤 저장소에도 쓰지 않는다.

import { assessSeniorRole, isImportableResult, SENIOR_KEYWORDS } from './app.js';

// ── 요소 참조 ─────────────────────────────────────────
const els = {
  input: document.getElementById('profile-input'),
  jobInput: document.getElementById('job-input'),
  assess: document.getElementById('assess-button'),
  example: document.getElementById('example-button'),
  exampleCareer: document.getElementById('example-career'),
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
  directionNote: document.getElementById('direction-note'),
  jobMatch: document.getElementById('job-match'),
  jobMatchList: document.getElementById('job-match-list'),
  answerNum: document.getElementById('answer-num'),
  answerText: document.getElementById('answer-text'),
  metaMatch: document.getElementById('meta-match'),
  metaGaps: document.getElementById('meta-gaps'),
  status: document.getElementById('app-status'),
};

// 화면에 띄우는 한국어 라벨 (키워드 15개 + 예외 값 "general")
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

// 내부 값(specialist / generalist / lead)을 화면에 띄우는 한국어 라벨
const DIRECTION_LABELS = {
  lead: '리더형',
  specialist: '전문가형',
  generalist: '탐색형',
};

// 진행 방향 한 줄 풀이
const DIRECTION_NOTES = {
  lead: '리드·팀·멘토 같은 키워드가 함께 나와, 이끄는 방향으로 읽혀요.',
  specialist: '여러 능력이 골고루 언급되어, 특화된 전문가 방향으로 읽혀요.',
  generalist: '여러 키워드가 고르게 나와 아직 방향을 탐색하는 단계로 읽혀요.',
};

// ── 한국어 처리 (화면 전용) ───────────────────────────
// SPEC의 순수 함수(assessSeniorRole)는 ASCII 알파벳 단어만 매칭한다.
// 한국어 이력도 강점으로 읽히게 하려면, 텍스트에 한국어가 섞여 있으면
// 대응하는 영어 키워드를 공백으로 이어 붙인 문자열을 뒤에 덧붙여
// assessSeniorRole에 넘긴다. 이 문자열은 화면에 보이지도,
// textarea 에도 쓰이지 않는다.
const KO_EN = [
  ['디자인', 'design'],
  ['설계', 'design'],
  ['기획', 'design'],
  ['아키텍처', 'architecture'],
  ['코딩', 'code'],
  ['코드', 'code'],
  ['리뷰', 'review'],
  ['검토', 'review'],
  ['멘토링', 'mentor'],
  ['멘토', 'mentor'],
  ['코칭', 'mentor'],
  ['확장', 'scale'],
  ['스케일', 'scale'],
  ['리팩터', 'refactor'],
  ['테스트', 'test'],
  ['보안', 'security'],
  ['성능', 'performance'],
  ['팀', 'team'],
  ['리드', 'lead'],
  ['리더', 'lead'],
  ['관리', 'manage'],
  ['출시', 'ship'],
  ['배포', 'deploy'],
];

// 텍스트에 포함된 한국어 단어를 15개 영어 키워드로 바꿔 덧붙인 문자열을
// 만든다. 한글이 하나도 없으면 원래 텍스트를 그대로 반환한다.
function normalizeKorean(text) {
  const koWords = text.match(/[\uac00-\ud7a3]+/g);
  if (!koWords) return text;
  const hit = new Set();
  for (const word of koWords) {
    for (const [ko, en] of KO_EN) {
      if (word === ko || word.startsWith(ko)) hit.add(en);
    }
  }
  if (hit.size === 0) return text;
  return text + ' ' + [...hit].join(' ');
}

// 성공한 점검 결과를 보관한다. (내보내기·대조에 사용)
let lastResult = null;

// ── 채용 공고 대조 ────────────────────────────────────
// 공고 요구 역량(assessSeniorRole 의 strengths)과 내 이력의 강점을
// 비교해 "갖춤 / 보완 필요"으로 그린다. 공고가 비우면 줄을 숨긴다.
function renderJobMatch() {
  const jobText = els.jobInput.value;
  if (!jobText.trim()) {
    els.jobMatch.hidden = true;
    els.jobMatchList.textContent = '';
    els.metaMatch.textContent = '';
    return;
  }
  let job;
  try {
    job = assessSeniorRole(normalizeKorean(jobText));
  } catch {
    els.jobMatch.hidden = true;
    els.jobMatchList.textContent = '';
    els.metaMatch.textContent = '';
    return;
  }

  const mine = new Set(lastResult ? lastResult.strengths : []);
  els.jobMatchList.textContent = '';
  let has = 0;

  if (job.strengths.length === 1 && job.strengths[0] === 'general') {
    const li = document.createElement('li');
    li.textContent = '공고에서 요구하는 역량을 찾지 못했어요. 공고를 다시 확인해 보세요.';
    els.jobMatchList.appendChild(li);
  } else {
    for (const key of job.strengths) {
      const ok = mine.has(key);
      if (ok) has += 1;
      const li = document.createElement('li');
      li.textContent = (ok ? '갖춤: ' : '보완 필요: ') + (STRENGTH_LABELS[key] || key);
      els.jobMatchList.appendChild(li);
    }
  }

  els.jobMatch.hidden = false;
  els.metaMatch.textContent = has + ' / ' + job.strengths.length;
}

// ── 결과 렌더링 ───────────────────────────────────────
// 결과 객체를 화면에 그린다. (리셋/초기화는 result = null 로 호출)
function render(result) {
  els.strengths.textContent = '';
  els.gaps.textContent = '';
  els.strengthsCount.textContent = '';
  els.gapsCount.textContent = '';
  els.direction.textContent = '';
  els.directionNote.textContent = '';
  els.answerNum.textContent = '';
  els.answerText.textContent = '';
  els.metaMatch.textContent = '';
  els.metaGaps.textContent = '';

  if (!result) {
    els.strengthsEmpty.hidden = false;
    els.gapsEmpty.hidden = false;
    els.directionNote.textContent = '점검하면 여기에 나와요.';
    els.answerNum.textContent = '탐색형';
    els.answerText.textContent = '아래 이력을 붙여 넣고 "점검하기"를 누르면, 여기에 결과가 나와요.';
    els.metaGaps.textContent = '';
    renderJobMatch();
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
  els.directionNote.textContent = DIRECTION_NOTES[result.direction] || '';

  // 답 카드: 방향(큰 글자) + 한 문장 + 보조 숫자
  els.answerNum.textContent = DIRECTION_LABELS[result.direction] || result.direction;
  els.answerText.textContent =
    '역량 ' + result.strengths.length + '개, 보완 영역 ' + result.gaps.length +
    '개를 찾았어요. 아래 목록에서 자세히 보세요.';
  els.metaGaps.textContent = result.gaps.length ? result.gaps.length + '개' : '없음';
  renderJobMatch();
}

// 상태 영역: 오류/성공 메시지. 빈 문자열이면 지운다.
function setStatus(message, isError = true) {
  els.status.textContent = message;
  els.status.className = 'status' + (message ? (isError ? ' error' : ' ok') : '');
}

// ── 점검하기 ─────────────────────────────────────────
function runAssess() {
  const text = els.input.value;
  let result;
  try {
    result = assessSeniorRole(normalizeKorean(text));
  } catch (err) {
    if (err instanceof RangeError) {
      if (text.trim().length === 0) {
        setStatus('이력 텍스트가 비어 있습니다. 내용을 입력한 뒤 다시 시도해 주세요.');
      } else if (text.trim().length > 20000) {
        setStatus('이력 텍스트가 너무 깁니다. 20,000자 이하로 줄인 뒤 다시 시도해 주세요.');
      } else {
        // 한국어 대응이 덧붙여져 20,000자를 넘긴 경우
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

// 학생·취준생 예시 (신입)
const EXAMPLE_TEXT =
  '컴퓨터공학과 3학년. 학교에서 팀 프로젝트를 리드했고, 코드 리뷰를 받아주며, 테스트 코드를 작성하고, ' +
  '배포를 담당했습니다. 인턴 기간에는 백엔드 코드를 만들고, 성능을 확인했어요. 자격증: 정보처리기사.';

// 기존 경력직 예시
const EXAMPLE_CAREER =
  '2012~2025 제조업 IT팀. Java로 백엔드 개발, 코드 리뷰 200건 이상, 클라우드 아키텍처 설계, ' +
  '보안·성능 최적화, 5명 팀 리드, 주니어 멘토링, 배포·확장 담당.';

// 채용 공고 예시 (짧은 한국어)
const EXAMPLE_JOB =
  '백엔드 신입 채용: 코드 리뷰, 테스트 작성, 배포 경험을 갖춘 분을 환영합니다. 보안·성능 개선 경험도 우대해요.';

function runExample() {
  els.input.value = EXAMPLE_TEXT;
  els.jobInput.value = EXAMPLE_JOB;
  runAssess();
}

function runExampleCareer() {
  els.input.value = EXAMPLE_CAREER;
  els.jobInput.value = EXAMPLE_JOB;
  runAssess();
}

// ── 초기화 ───────────────────────────────────────────
function runReset() {
  els.input.value = '';
  els.jobInput.value = '';
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
els.exampleCareer.addEventListener('click', runExampleCareer);
els.reset.addEventListener('click', runReset);
els.export.addEventListener('click', runExport);
els.importFile.addEventListener('change', onImportChange);
els.jobInput.addEventListener('input', renderJobMatch);

// 첫 화면에 예시로 계산된 답을 미리 채워 둔다. (빈 답 카드 금지)
render(null);
