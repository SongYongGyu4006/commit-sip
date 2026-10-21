// compareFeatures — 순수 비교 함수.
// SPEC 규칙: 2~10개 도구, 3~8개 기능, 점수 0~100, 이름·기능 이름은 trim 후 비교.
// 타입 오류 → TypeError, 값/범위/중복/불일치 → RangeError.
// Node에서 import해도 DOM·저장소·전역에 영향을 주지 않는다.

export const MAX_TOOLS = 10;
export const MIN_TOOLS = 2;
export const MAX_FEATURES = 8;
export const MIN_FEATURES = 3;

export const TOOL_COLORS = [
  '#4f7cff', '#e0552b', '#17a673', '#c23fb0', '#d9962b',
  '#25a6d9', '#7b52d9', '#c43b3b', '#3f9f4a', '#8a6d5c',
];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function typeError(msg) {
  return new TypeError(msg);
}

function rangeError(msg) {
  return new RangeError(msg);
}

// 반올림: 0.5 단위는 올림(0 기준에서 위쪽으로), 나머지는 가장 가까운 정수.
function roundScore(v) {
  return Math.floor(v + 0.5);
}

// 1개 도구의 scores를 검사해 { key(원본), name(trim) } 배열 반환.
function validateScoresObject(scores, toolName, typeKey, rangeKey) {
  if (!isPlainObject(scores)) {
    throw typeError(`"${toolName}" 도구의 ${typeKey}이(가) 평범한 객체가 아닙니다.`);
  }
  const keys = Object.keys(scores);
  if (keys.length < MIN_FEATURES || keys.length > MAX_FEATURES) {
    throw rangeError(`기능 개수는 ${MIN_FEATURES}~${MAX_FEATURES}개여야 합니다 (현재 ${keys.length}개).`);
  }
  const seen = new Set();
  const out = [];
  for (const key of keys) {
    const name = key.trim();
    if (name === '') {
      throw rangeError(`${typeKey} 이름이 비어 있습니다.`);
    }
    if (seen.has(name)) {
      throw rangeError(`"${toolName}" 도구에 중복된 ${typeKey} 이름 "${name}"이(가) 있습니다.`);
    }
    seen.add(name);
    out.push({ key, name });
  }
  return out;
}

export function compareFeatures(tools) {
  if (!Array.isArray(tools)) {
    throw typeError('도구 목록은 배열이어야 합니다.');
  }
  if (tools.length < MIN_TOOLS || tools.length > MAX_TOOLS) {
    throw rangeError(`도구는 ${MIN_TOOLS}~${MAX_TOOLS}개여야 합니다 (현재 ${tools.length}개).`);
  }

  const names = [];
  const scoreLists = [];
  for (const tool of tools) {
    if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) {
      throw typeError('각 도구는 객체여야 합니다.');
    }
    if (typeof tool.name !== 'string') {
      throw typeError('도구 이름은 문자열이어야 합니다.');
    }
    const name = tool.name.trim();
    if (name === '') {
      throw rangeError('도구 이름이 비어 있습니다.');
    }
    if (names.includes(name)) {
      throw rangeError(`도구 이름 "${name}"이 중복됩니다. 다른 이름으로 바꿔 주세요.`);
    }
    names.push(name);
    scoreLists.push(validateScoresObject(tool.scores, name, '기능', '기능'));
  }

  const first = scoreLists[0];
  const features = first.map((s) => s.name);

  for (let i = 1; i < scoreLists.length; i++) {
    if (scoreLists[i].length !== features.length) {
      throw rangeError(`기능 개수가 일치하지 않습니다. 모든 도구는 ${features.length}개 기능과 같은 순서로 가집니다.`);
    }
    for (let j = 0; j < features.length; j++) {
      if (scoreLists[i][j].name !== features[j]) {
        throw rangeError(`기능 이름이 일치하지 않습니다. 모든 도구는 "${features.join(' / ')}" 순서로 기능 이름을 같게 가져야 합니다.`);
      }
    }
  }

  const normalized = tools.map((tool, i) => ({
    name: names[i],
    points: scoreLists[i].map((s, j) => {
      const v = tool.scores[s.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw typeError(`"${names[i]}" 도구의 "${features[j]}" 점수는 0~100 범위의 숫자여야 합니다.`);
      }
      if (v < 0 || v > 100) {
        throw rangeError(`"${names[i]}" 도구의 "${features[j]}" 점수는 0~100 사이여야 합니다 (현재 ${v}).`);
      }
      return { feature: features[j], score: roundScore(v) };
    }),
  }));

  return { tools, features, normalized };
}
