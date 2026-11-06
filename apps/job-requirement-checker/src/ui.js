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

// 예시 3: 예시 데이터 없이 빈 화면에서 "예시"를 눌렀을 때(실사용 시나리오).
// 첫 화면 예시 버튼(#example-button)은 loadExample을 호출해 공고+스펙을 채운 뒤 runAnalysis를 실행한다.
// 이 시나리오는 loadExample → runAnalysis 경로를 검증한다.

// 상태 영역에 메시지를 표시(자동 사라짐 없음: 명시적으로만 비움). kind: 'error' | 'notice' | 'ok'
function setStatus(text, kind = 'error') {
  const el = document.getElementById('app-status');
  el.textContent = text;
  el.className = kind;
}

// text-area의 내용을 공고 목록으로 만든다.
// 채용 사이트에서 붙여넣은 공고는 여러 줄이므로, 빈 줄로 구분된 블록을 한 공고로 취급한다.
// 블록 안의 줄은 공백 하나로 합치고, 제목은 첫 토큰을 쓴다.
// 빈 줄이 없고 줄이 한 줄뿐이면 그대로, 빈 줄이 없고 줄이 여러 개면 한 줄 = 한 공고(기존 방식).
function parseJobs(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b !== '');
  const hasBlank = /\n\s*\n/.test(text);
  return blocks.map((block) => {
    const lineCount = block.split('\n').filter((l) => l.trim() !== '').length;
    if (!hasBlank && lineCount > 1) {
      // 빈 줄 구분 없이 여러 줄이면 기존처럼 한 줄 = 한 공고
      return block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => ({ title: line.split(/\s+/)[0], text: line }));
    }
    const merged = block.replace(/\s+/g, ' ').trim();
    return [{ title: merged.split(/\s+/)[0], text: merged }];
  }).flat();
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

// 역량 이름에서 아바타 색(data-hue 0~7). 같은 이름은 늘 같은 색.
function hueOf(name) {
  let sum = 0;
  for (const ch of String(name)) sum += ch.codePointAt(0);
  return sum % 8;
}

// skill-list를 skills 배열 순서 그대로(재구축) 채운다. textContent만 사용.
// 빈 상태 안내(#skill-empty-hint)는 목록이 비어 있을 때만 표시한다.
// 상위 10개에 가로 막대를 깐다.
const SKILL_VISIBLE = 10;

function renderSkillList(skills) {
  const list = document.getElementById('skill-list');
  const moreButton = document.getElementById('skill-more-button');
  const hiddenWrap = document.getElementById('skill-more-hidden');
  list.innerHTML = '';
  if (moreButton) moreButton.style.display = '';
  if (hiddenWrap) hiddenWrap.innerHTML = '';
  const max = skills.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  skills.forEach((skill, i) => {
    const li = document.createElement('li');
    li.className = 'skill-item';
    if (i < SKILL_VISIBLE) {
      const maxCount = skills.slice(0, SKILL_VISIBLE).reduce((m, s) => Math.max(m, s.count), 0) || 1;
      li.style.setProperty('--w', (skill.count / maxCount) * 100 + '%');
      li.className += ' skill-bar';
    }
    const name = document.createElement('span');
    name.className = 'skill-name';
    name.textContent = skill.name;
    const meta = document.createElement('span');
    meta.className = 'skill-meta';
    meta.textContent = '필수 ' + skill.must + ' · 선호 ' + skill.preferred;
    li.appendChild(name);
    li.appendChild(meta);
    if (i < SKILL_VISIBLE) {
      list.appendChild(li);
    } else {
      hiddenWrap.appendChild(li);
    }
  });
  const hint = document.getElementById('skill-empty-hint');
  if (hint) hint.style.display = skills.length ? 'none' : '';
  const wrap = document.getElementById('skill-wrap');
  if (wrap) wrap.style.display = skills.length ? '' : 'none';
  if (moreButton) {
    const hidden = skills.length > SKILL_VISIBLE;
    moreButton.style.display = hidden ? '' : 'none';
    if (hidden) moreButton.textContent = '더 보기 (' + (skills.length - SKILL_VISIBLE) + '개)';
    hiddenWrap.style.display = hidden ? '' : 'none';
  }
}

// 더 보기: 접힌 나머지 역량 목록을 펼친다.
function toggleMore() {
  const hiddenWrap = document.getElementById('skill-more-hidden');
  const btn = document.getElementById('skill-more-button');
  if (!hiddenWrap || !btn) return;
  const open = hiddenWrap.style.display === 'none';
  hiddenWrap.style.display = open ? '' : 'none';
  btn.textContent = open ? '접기' : btn.textContent.replace(/^더 보기/, '더 보기');
  btn.setAttribute('aria-expanded', String(open));
}

// 답 카드(큰 숫자) 갱신: 필수 부족 개수 + 한 문장 + 보조 숫자 3개.
// ds-answer-num / ds-answer-text / ds-answer-meta 를 갱신한다.
function renderAnswer(result, gap, hasSpec) {
  const num = document.getElementById('answer-num');
  const text = document.getElementById('answer-text');
  const meta = document.querySelector('.ds-answer-meta');
  if (!num || !text || !meta) return;
  const mustGap = hasSpec ? gap.filter((e) => !e.has && e.jobMust > 0).length : 0;
  const prefGap = hasSpec ? gap.filter((e) => !e.has && e.jobMust === 0).length : 0;
  const okCount = hasSpec ? gap.filter((e) => e.has && (e.jobMust > 0 || e.jobPreferred > 0)).length : 0;
  num.innerHTML = mustGap + '<small>개</small>';
  text.textContent = hasSpec
    ? '필수 역량 ' + mustGap + '개를 채우면 이 공고 지원 자격이 맞춰져요.'
    : '예시: 필수 역량 중 내 스펙에 없는 것 ' + mustGap + '개. 내 스펙을 넣으면 숫자가 바뀝니다.';
  meta.innerHTML =
    '<div><dt>분석한 공고</dt><dd>' + result.count + '건</dd></div>' +
    '<div><dt>충족</dt><dd>' + okCount + '개</dd></div>' +
    '<div><dt>우대 부족</dt><dd>' + prefGap + '개</dd></div>';
}

// 내 스펙 토큰과 공고 토큰(필수/선호)을 대조해 격차(합친 목록)를 만든다.
function computeGap(jobResult, specTokens) {
  const gap = new Map(); // name -> { name, has: bool, jobMust: n, jobPreferred: n }
  for (const token of specTokens) {
    let entry = gap.get(token);
    if (!entry) { entry = { name: token, has: true, jobMust: 0, jobPreferred: 0 }; gap.set(token, entry); }
    entry.has = true;
  }
  for (const skill of jobResult.skills) {
    let entry = gap.get(skill.name);
    if (!entry) { entry = { name: skill.name, has: false, jobMust: 0, jobPreferred: 0 }; gap.set(skill.name, entry); }
    entry.jobMust += skill.must;
    entry.jobPreferred += skill.preferred;
  }
  return [...gap.values()];
}

// 격차 카드를 렌더링한다. 내 스펙이 있으면 교집합/격차 목록, 없으면 안내 문구만.
// 순서: 필수 부족 → 우대 부족 → 충족 → 공고에 없는 스펙
// (함수 선언은 런타임 이전 단계에서 전체 함수가 이미 정의되기 때문에 renderAnswer 이후에 있어도
//  runAnalysis 안에서 부르는 호출과 충돌이 없다)
function renderGap(gap, hasSpec) {
  const summary = document.getElementById('gap-summary');
  const list = document.getElementById('gap-list');
  const emptyHint = document.getElementById('gap-empty-hint');
  const wrap = document.getElementById('gap-wrap');
  summary.textContent = '';
  list.innerHTML = '';
  if (wrap) wrap.style.display = hasSpec ? '' : 'none';
  if (!hasSpec) {
    summary.textContent = '내 스펙을 적으면 부족한 필수 역량을 알려 드려요.';
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';
  if (!gap.length) {
    summary.textContent = '대조할 항목이 없습니다.';
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  const mustGap = gap.filter((e) => !e.has && e.jobMust > 0);
  const prefGap = gap.filter((e) => !e.has && e.jobMust === 0);
  const ok = gap.filter((e) => e.has && (e.jobMust > 0 || e.jobPreferred > 0));
  const onlySpec = gap.filter((e) => e.has && e.jobMust === 0 && e.jobPreferred === 0);
  const ordered = [...mustGap, ...prefGap, ...ok, ...onlySpec];
  for (const entry of ordered) {
    const label = entry.has ? entry.name : '누락 ' + entry.name;
    const kind = entry.has && (entry.jobMust > 0 || entry.jobPreferred > 0)
      ? 'ok'
      : entry.has
        ? 'warn'
        : entry.jobMust > 0
          ? 'must'
          : 'pref';
    const li = document.createElement('li');
    li.className = 'skill-item';
    const av = document.createElement('span');
    av.className = 'ds-avatar ds-avatar-s';
    av.setAttribute('data-hue', String(hueOf(entry.name)));
    av.setAttribute('aria-hidden', 'true');
    let first = '';
    for (const ch of entry.name) { first = ch; break; }
    av.textContent = first.toUpperCase();
    const main = document.createElement('div');
    main.className = 'ds-list-main';
    const title = document.createElement('span');
    title.className = 'ds-list-title';
    title.textContent = label;
    const sub = document.createElement('span');
    sub.className = 'ds-list-sub';
    sub.textContent = kind === 'ok' ? '내 스펙에 있고 공고도 요구' : '내 스펙에 없음';
    main.appendChild(title);
    main.appendChild(sub);
    const end = document.createElement('div');
    end.className = 'ds-list-end';
    const amt = document.createElement('span');
    amt.className = 'ds-list-amount ' + (kind === 'ok' ? 'meta-ok' : kind === 'warn' ? 'meta-warn' : 'meta-gap');
    const words = { must: '필수 부족', pref: '우대 부족', ok: '충족', warn: '공지 없음' };
    amt.textContent = words[kind] + (kind === 'ok' ? '' : kind === 'warn' ? '' : ' ' + entry.jobMust);
    end.appendChild(amt);
    li.appendChild(av);
    li.appendChild(main);
    li.appendChild(end);
    list.appendChild(li);
  }
  const mustCount = mustGap.length;
  const prefCount = prefGap.length;
  const okCount = ok.length;
  summary.textContent =
    '필수 역량 중 내 스펙에 없는 것 ' + mustCount + '개' +
    ' · 우대 중 없는 것 ' + prefCount + '개' +
    ' · 충족 ' + okCount + '개';
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
    document.getElementById('analysis-json').textContent = JSON.stringify(result, null, 2);
    renderSkillList(result.skills);
    const specTokens = tokenize(specText);
    const gap = computeGap(result, specTokens);
    renderGap(gap, hasSpec);
    renderAnswer(result, gap, hasSpec);
    if (!hasSpec) {
      setStatus('내 스펙이 비어 있어서 공고만 분석했어요. “내 스펙”에 경력·학력·자격증·프로젝트·활동을 채우면, 공고가 요구하는 수준 대비 격차를 함께 보여 줍니다.', 'notice');
    } else {
      setStatus('');
    }
  } catch (err) {
    setStatus('분석을 실패했습니다. ' + err.message + ' — 공고 여러 건은 빈 줄로 구분하세요.');
  }
}

function resetAll() {
  document.getElementById('text-area').value = '';
  document.getElementById('my-spec').value = '';
  const list = document.getElementById('skill-list');
  list.innerHTML = '';
  const hiddenWrap = document.getElementById('skill-more-hidden');
  if (hiddenWrap) hiddenWrap.innerHTML = '';
  const moreButton = document.getElementById('skill-more-button');
  if (moreButton) moreButton.style.display = 'none';
  const hint = document.getElementById('skill-empty-hint');
  if (hint) hint.style.display = '';
  const wrap = document.getElementById('skill-wrap');
  if (wrap) wrap.style.display = '';
  document.getElementById('gap-summary').textContent = '';
  document.getElementById('gap-list').innerHTML = '';
  const gapWrap = document.getElementById('gap-wrap');
  if (gapWrap) gapWrap.style.display = '';
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
  const moreButton = document.getElementById('skill-more-button');
  if (moreButton) moreButton.addEventListener('click', toggleMore);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
