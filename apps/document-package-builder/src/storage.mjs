// 단일 localStorage 키("submissionpackager.state.v1")에 옵션·파일 이름 목록·예시 데이터를
// 저장·복원·삭제하고 backup.json 직렬화·검증을 담당한다.
// Node(테스트)에서는 localStorage가 없어도 기본 상태를 돌려 준다.

const KEY = 'submissionpackager.state.v1';

function defaultState() {
  return {
    v: 1,
    options: { merge: true, mask: true, shrink: true, targetMb: 10, targetCustom: '', range: '' },
    fileNames: [],
    boxes: {}, // fileKey(이름+크기 해시 대신 "이름|크기") → 박스 목록
    sample: null, // "예시로 해 보기"로 불러온 예시 데이터
  };
}

function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// 저장된 문자열을 복원한다. 없거나 깨졌으면 기본 상태.
export function loadState() {
  if (typeof localStorage === 'undefined') return defaultState();
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return defaultState();
  }
  if (!raw) return defaultState();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultState();
  }
  const d = defaultState();
  if (!isObj(data)) return d;
  return {
    v: 1,
    options: {
      ...d.options,
      ...(isObj(data.options) ? data.options : {}),
    },
    fileNames: Array.isArray(data.fileNames) ? data.fileNames.filter((x) => typeof x === 'string') : [],
    boxes: isObj(data.boxes) ? data.boxes : {},
    sample: isObj(data.sample) ? data.sample : null,
  };
}

// 상태를 localStorage에 쓴다. 실패(예: 저장 공간)는 조용히 무시한다.
export function saveState(state) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 상태를 전부 지운다.
export function clearState() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

// backup.json 문자열(2칸 들여쓰기)을 만든다.
export function exportBackup(state) {
  return JSON.stringify(state ?? defaultState(), null, 2);
}

// backup.json 문자열을 검증해 상태 객체를 돌려준다. 형식이 다르면 null.
export function importBackup(text) {
  if (typeof text !== 'string') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;
  if (!isObj(data.options)) return null;
  const o = data.options;
  if (typeof o.merge !== 'boolean' || typeof o.mask !== 'boolean' || typeof o.shrink !== 'boolean') return null;
  if (!Array.isArray(data.fileNames) || !data.fileNames.every((x) => typeof x === 'string')) return null;
  const d = defaultState();
  return {
    v: 1,
    options: {
      merge: o.merge,
      mask: o.mask,
      shrink: o.shrink,
      targetMb: Number(o.targetMb) || d.options.targetMb,
      targetCustom: typeof o.targetCustom === 'string' ? o.targetCustom : '',
      range: typeof o.range === 'string' ? o.range : '',
    },
    fileNames: data.fileNames,
    boxes: isObj(data.boxes) ? data.boxes : {},
    sample: isObj(data.sample) ? data.sample : null,
  };
}

export { KEY as STORAGE_KEY };
