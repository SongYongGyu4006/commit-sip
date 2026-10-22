// 화면 로직: 파일 선택, 공고·스펙 입력, 격차 분석, 결과 렌더링, 초기화, 예시 실행
// (모듈 번들 빌드에서 import 구문은 제거됨; 이 파일은 index.html이 인라인 스크립트로 포함해 실행된다)

// 예시 1: 현실적인 채용 공고(한 줄 = 한 공고) + 내 스펙 쌍
const EXAMPLE_TEXT = [
  '초등 교사 영어 회화 수업, 영어 회화 경험 우대, 영어 회화 면접',
  '중등 교사 수학 교육 경력 5년 이상, 수학 교재 개발',
  '중등교사 수학 교육 경력 3년 이상, 수학·과학 교재 개발 경험 필수, 스펙트럼 학생 상담면접 경험 선호',
].join('\n');

const EXAMPLE_SPEC =
  '영어 회화 면접 준비, 수학 교육 경험, 스펙트럼 학생 상담, TOEIC 850, 교육 봉사 100시간';

// 예시 2: 학생·취준생형 스펙 (연차 없음, 학점·자격증·동아리 중심) + 지원 공고
const EXAMPLE_STUDENT_TEXT =
  '중등교사 수학 교육 경력 3년 이상, 수학·과학 교재 개발 경험 필수, 스펙트럼 학생 상담면접 경험 선호';

const EXAMPLE_STUDENT_SPEC =
  '수학 학사 4학년, 평점 4.2, 수학 교재 개발 프로젝트 1회, 스펙트럼 학생 상담 동아리 2년, 교육 봉사 200시간, TOEIC 900';

// 상태 영역에 메시지를 표시(자동 사라짐 없음: 명시적으로만 비움). kind: 'error' | 'notice' | 'ok'
function setStatus(text, kind = 'error') {
  const el = document.getElementById('app-status');
  el.textContent = text;
  el.className = kind;
}

// text-area의 내용을 행으로 나누어 각 비어 있지 않은 행을 하나의 공고로 만든다.
// title: 행의 첫 띄어쓰기 구분 토큰, text: 행 전체
function parseJobs(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => ({
      title: line.split(/\s+/)[0],
      text: line,
    }));
}

// 한 토큰을 소문자로: ASCII 대문자(A-Z)만 a-z로, 그 외 문자(한글·한자·숫자 등)는 그대로
function lowercaseAscii(token) {
  let out = '';
  for (const ch of token) {
    const code = ch.codePointAt(0);
    out += code >= 0x41 && code <= 0x5a ? String.fromCodePoint(code + 32) : ch;
  }
  return out;
}

// 공백/문자점이 아닌 최대 연속 문자(한글·한자·숫자도 모두 한 토큰)로 토큰화
const UI_TOKEN_RE = /[^\s\p{P}]+/gu;
const UI_MARKER_TOKENS = new Set(['요망', '필수', '만족', 'must', '선호', '우대']);

function tokenize(text) {
  const tokens = text.match(UI_TOKEN_RE) || [];
  return tokens
    .map((t) => lowercaseAscii(t))
    .filter((t) => t !== '' && !UI_MARKER_TOKENS.has(t));
}


// skill-list를 skills 배열 순서 그대로(재구축) 채운다. textContent만 사용.
// 빈 상태 안내(#skill-empty-hint)는 목록이 비어 있을 때만 표시한다.
function renderSkillList(skills) {
  const list = document.getElementById('skill-list');
  list.innerHTML = '';
  for (const skill of skills) {
    const li = document.createElement('li');
    li.className = 'skill-item';
    const name = document.createElement('span');
    name.className = 'skill-name';
    name.textContent = skill.name;
    const meta = document.createElement('span');
    meta.className = 'skill-meta';
    meta.textContent = '필수 ' + skill.must + ' · 선호 ' + skill.preferred;
    li.appendChild(name);
    li.appendChild(meta);
    list.appendChild(li);
  }
  const hint = document.getElementById('skill-empty-hint');
  if (hint) hint.style.display = skills.length ? 'none' : '';
}

// 내 스펙 토큰과 공고 토큰(필수/선호)을 대조해 격차(합친 목록)를 만든다.
function computeGap(jobResult, specTokens) {
  const gap = new Map(); // name -> { has: bool, jobMust: n, jobPreferred: n }
  for (const token of specTokens) {
    let entry = gap.get(token);
    if (!entry) { entry = { has: true, jobMust: 0, jobPreferred: 0 }; gap.set(token, entry); }
    entry.has = true;
  }
  for (const skill of jobResult.skills) {
    let entry = gap.get(skill.name);
    if (!entry) { entry = { has: false, jobMust: 0, jobPreferred: 0 }; gap.set(skill.name, entry); }
    entry.jobMust += skill.must;
    entry.jobPreferred += skill.preferred;
  }
  return [...gap.values()];
}

// 격차 카드를 렌더링한다. 내 스펙이 있으면 교집합/격차 목록, 없으면 안내 문구만.
function renderGap(gap, hasSpec) {
  const summary = document.getElementById('gap-summary');
  const list = document.getElementById('gap-list');
  const emptyHint = document.getElementById('gap-empty-hint');
  summary.textContent = '';
  list.innerHTML = '';
  if (!hasSpec) {
    summary.textContent = '내 스펙을 채우면, 공고가 요구하는 수준과 내 스펙을 대조해 충족·차이를 여기에 보여 줍니다.';
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';
  if (!gap.length) {
    summary.textContent = '대조할 항목이 없습니다.';
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';
  for (const entry of gap) {
    const label = entry.name !== undefined && entry.name !== null && entry.name !== ''
      ? (entry.has ? entry.name : '누락 ' + entry.name)
      : '';
    const matched = entry.has && (entry.jobMust > 0 || entry.jobPreferred > 0);
    const li = document.createElement('li');
    li.className = 'skill-item';
    const name = document.createElement('span');
    name.className = 'skill-name';
    name.textContent = label;
    const meta = document.createElement('span');
    meta.className = 'skill-meta' + (matched ? ' meta-ok' : entry.has ? ' meta-warn' : ' meta-gap');
    meta.textContent = matched
      ? '충족 (공고 필수 ' + entry.jobMust + ' · 선호 ' + entry.jobPreferred + ')'
      : entry.has
        ? '미상 (공고 언급 없음)'
        : '차이 (공고 필수 ' + entry.jobMust + ' · 선호 ' + entry.jobPreferred + ')';
    li.appendChild(name);
    li.appendChild(meta);
    list.appendChild(li);
  }
  const matchedCount = gap.filter((e) => e.has && (e.jobMust > 0 || e.jobPreferred > 0)).length;
  const gapCount = gap.filter((e) => !e.has).length;
  const onlySpecCount = gap.filter((e) => e.has && !(e.jobMust > 0 || e.jobPreferred > 0)).length;
  summary.textContent =
    '충족 ' + matchedCount + ' · 차이(내 스펙 없음) ' + gapCount + ' · 공고에 없는 스펙 ' + onlySpecCount;
}

function runAnalysis() {
  const area = document.getElementById('text-area');
  const content = area.value;
  if (content.trim() === '') {
    setStatus('내용을 입력해 주세요. 채용 공고 본문이 비어 있으면 분석할 수 없습니다.');
    return;
  }
  // URL로 시작하면 링크는 직접 열 수 없어 본문 복사를 안내(분석은 계속 진행)
  if (/^https?:\/\//i.test(content.trim())) {
    setStatus('링크는 직접 열 수 없어요. 사이트에서 본문 문서를 복사해 붙여넣어 주세요. (아래 분석은 붙여넣은 내용 그대로 진행됩니다)', 'notice');
  }
  const specText = document.getElementById('my-spec').value;
  const hasSpec = specText.trim() !== '';
  try {
    const result = analyzeJobDescriptions(parseJobs(content));
    document.getElementById('analysis-json').textContent = JSON.stringify(result);
    renderSkillList(result.skills);
    const specTokens = tokenize(specText);
    renderGap(computeGap(result, specTokens), hasSpec);
    if (!hasSpec) {
      setStatus('내 스펙이 비어 있어서 공고만 분석했어요. “내 스펙”에 경력·학력·자격증·프로젝트·활동을 채우면, 공고가 요구하는 수준 대비 격차를 함께 보여 줍니다.', 'notice');
    } else {
      setStatus('');
    }
  } catch (err) {
    setStatus('분석을 실패했습니다. ' + err.message + ' — 각 행은 “제목 공백 본문” 형식으로 한 행에 한 공고씩 적어야 합니다.');
  }
}

function resetAll() {
  document.getElementById('text-area').value = '';
  document.getElementById('my-spec').value = '';
  const list = document.getElementById('skill-list');
  list.innerHTML = '';
  const hint = document.getElementById('skill-empty-hint');
  if (hint) hint.style.display = '';
  document.getElementById('gap-summary').textContent = '';
  document.getElementById('gap-list').innerHTML = '';
  const gapEmpty = document.getElementById('gap-empty-hint');
  if (gapEmpty) gapEmpty.style.display = '';
  document.getElementById('analysis-json').textContent = '';
  setStatus('');
}

function loadExample() {
  document.getElementById('text-area').value = EXAMPLE_TEXT;
  document.getElementById('my-spec').value = EXAMPLE_SPEC;
  setStatus('');
  runAnalysis();
}

function loadStudentExample() {
  document.getElementById('text-area').value = EXAMPLE_STUDENT_TEXT;
  document.getElementById('my-spec').value = EXAMPLE_STUDENT_SPEC;
  setStatus('');
  runAnalysis();
}

// initApp: 화면 리스너 연결. 인라인 스크립트로는 자동 실행, 모듈 import로는 initApp()을 직접 부른다.
function initApp() {
  const addJobButton = document.getElementById('add-job-button');
  const textFile = document.getElementById('text-file');
  const area = document.getElementById('text-area');

  // 파일 선택 열기 → 파일 텍스트를 text-area로 읽음(기존 내용 교체)
  addJobButton.addEventListener('click', () => textFile.click());
  textFile.addEventListener('change', () => {
    const file = textFile.files && textFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      area.value = String(reader.result);
      setStatus('');
    };
    reader.onerror = () => {
      setStatus('파일을 읽는 동안 오류가 발생했습니다. 파일을 다시 선택해 주세요.');
    };
    reader.readAsText(file);
    textFile.value = ''; // 같은 파일을 다시 선택해도 change가 다시 일어나도록
  });

  document.getElementById('analyze-button').addEventListener('click', runAnalysis);
  document.getElementById('reset-button').addEventListener('click', resetAll);
  document.getElementById('example-button').addEventListener('click', loadExample);
  document.getElementById('student-example-button').addEventListener('click', loadStudentExample);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
