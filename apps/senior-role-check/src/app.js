// Senior Role Check — 순수 로직 모듈
// 이 모듈은 화면(DOM)·저장소·네트워크에 접근하지 않는 순수 함수만 export 한다.
// Node에서 import해도 부작용(side effect)이 없다.

// 15개 역량 키워드 (SPEC에서 고정된 순서)
export const SENIOR_KEYWORDS = [
  'design', 'architecture', 'code', 'review', 'mentor',
  'scale', 'refactor', 'test', 'security', 'performance',
  'team', 'lead', 'manage', 'ship', 'deploy',
];

// 리더십 계열 키워드 (direction 판정에서 "lead"와 함께 쓰이는 키워드)
const LEADERSHIP_KEYWORDS = new Set(['team', 'mentor', 'manage']);

const MAX_LENGTH = 20000;
const WORD_RE = /[a-z]+/g;

// 단어 w가 base의 허용된 변화형(원형/복수 -s -es/과거 -ed/3인칭단수 -s -es/진행 -ing)
// 으로 읽히는지를 판정한다. 이미 소문자로 정규화되어 전달된다.
// 합성어("codebase", "testbed" 등)는 절대 매치하지 않는다.
export function matchesInflection(w, base) {
  const b = base.length;
  // 원형: base
  if (w === base) return true;
  // base 뒤에 -s / -es / -ed / -ing 을 붙인 형태
  if (w.length > b && w.slice(0, b) === base &&
      (w.slice(b) === 's' || w.slice(b) === 'es' ||
       w.slice(b) === 'ed' || w.slice(b) === 'ing')) {
    return true;
  }
  // "led"는 "lead"의 불규칙 과거형 (SPEC 명시: "led"와 "leads"는 "lead"에 매치).
  // "scaled"처럼 base+ed가 아니라 base의 e를 빼고 d를 붙인 형태는 SPEC의
  // 열거된 변화형(원형/-s/-es/-ed/-ing)에 해당하지 않으므로 매치하지 않는다.
  if (base === 'lead' && w === 'led') return true;
  return false;
}

/**
 * 이력 텍스트에서 15개 키워드의 언급 여부를 분석해
 * {strengths, gaps, direction} 객체를 반환한다.
 *
 * - profileText가 문자열이 아니면 TypeError
 * - trim 후 공백이거나 20000자를 초과하면 RangeError (20000자 정밀 허용)
 * - 순수 함수: 동일 입력에 항상 동일 결과를 반환하며, 외부 상태를 읽거나 쓰지 않는다.
 *
 * @param {string} profileText - 자유 형식 이력/경력 텍스트
 * @returns {{strengths: string[], gaps: string[], direction: 'specialist'|'generalist'|'lead'}}
 */
export function assessSeniorRole(profileText) {
  if (typeof profileText !== 'string') {
    throw new TypeError('profileText는 문자열이어야 합니다.');
  }
  const trimmed = profileText.trim();
  if (trimmed.length === 0) {
    throw new RangeError('이력 텍스트는 비어 있을 수 없습니다. 내용을 입력해 주세요.');
  }
  if (trimmed.length > MAX_LENGTH) {
    throw new RangeError('이력 텍스트는 20000자를 초과할 수 없습니다.');
  }

  const words = (trimmed.toLowerCase().match(WORD_RE) || []);
  const matched = [];
  for (const keyword of SENIOR_KEYWORDS) {
    if (words.some((w) => matchesInflection(w, keyword))) {
      matched.push(keyword); // 목록 순서대로, 중복 제거
    }
  }

  let strengths;
  let gaps;
  if (matched.length === 0) {
    strengths = ['general']; // 예약된 예외 값: 키워드가 아님
    gaps = [];
  } else {
    strengths = matched;
    gaps = SENIOR_KEYWORDS.filter((k) => !matched.includes(k)).slice(0, 2);
  }

  const leadMatched = matched.includes('lead');
  const otherLeadership = matched.some((k) => LEADERSHIP_KEYWORDS.has(k) && k !== 'lead');
  let direction;
  if (leadMatched && otherLeadership) {
    direction = 'lead';
  } else if (matched.length >= 3) {
    direction = 'specialist';
  } else if (matched.length >= 1 && leadMatched) {
    direction = 'lead';
  } else {
    direction = 'generalist';
  }

  return { strengths, gaps, direction }; // 키 순서: strengths, gaps, direction
}

// ─────────────────────────────────────────────────────────────
// import 검증용 유틸 (순수): 내보낸 JSON 결과를 다시 받아들이기 전
// 형식만 검증한다. 화면에서는 importFile()이 이 함수를 사용한다.
// ─────────────────────────────────────────────────────────────

const DIRECTION_VALUES = new Set(['specialist', 'generalist', 'lead']);
const KEYWORD_SET = new Set(SENIOR_KEYWORDS);

function isStringArray(arr, { nonEmpty = false, validate } = {}) {
  if (!Array.isArray(arr)) return false;
  if (nonEmpty && arr.length === 0) return false;
  return arr.every((v) =>
    typeof v === 'string' && v.length <= 120 &&
    (validate ? validate(v) : true)
  );
}

/**
 * 임포트할 JSON 파일의 내용을 검증한다.
 * 정확히 strengths/gaps/direction 3개 키만 갖고, 값의 형식이 유효할 때 true.
 * (앱이 스스로 export한 파일은 항상 true여야 한다.)
 */
export function isImportableResult(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== 3) return false;
  if (!keys.includes('strengths') || !keys.includes('gaps') || !keys.includes('direction')) return false;
  const strengths = obj.strengths;
  const gaps = obj.gaps;
  const direction = obj.direction;
  const strengthsValid = isStringArray(strengths, {
    nonEmpty: true,
    validate: (v) => v === 'general' || KEYWORD_SET.has(v),
  });
  const gapsValid = isStringArray(gaps, {
    validate: (v) => KEYWORD_SET.has(v),
  });
  const directionValid = typeof direction === 'string' && DIRECTION_VALUES.has(direction);
  return strengthsValid && gapsValid && directionValid;
}
