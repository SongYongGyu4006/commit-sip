// 순수 함수: 모델 데이터를 검증·필터·정렬해 결과 객체를 만든다. 화면·저장소·전역에 부작용이 없다.

const RAW_FIELDS = [
  "model", "repo", "weights_gb", "measured", "gen_tps_short", "gen_tps_long",
  "peak_memory_gb", "kmmlu_of_50", "tools_of_10", "code_of_10", "format_of_10", "mac",
];
const NUMBER_FIELDS = [
  "weights_gb", "gen_tps_short", "gen_tps_long", "peak_memory_gb",
  "kmmlu_of_50", "tools_of_10", "code_of_10", "format_of_10",
];
const MEMORY_OPTIONS = [8, 16, 24, 32, 48, 64, 128];
const CATEGORIES = ["korean", "coding", "tools", "speed"];
const PRIMARY_METRIC = {
  korean: "kmmlu_of_50",
  coding: "code_of_10",
  tools: "tools_of_10",
  speed: "gen_tps_short",
};

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

function validateRawModel(row) {
  if (!isPlainObject(row)) throw new TypeError("rawModels 의 항목은 평범한 객체여야 합니다.");
  if (typeof row.model !== "string" || typeof row.repo !== "string")
    throw new TypeError("model / repo 는 문자열이어야 합니다.");
  if (typeof row.measured !== "string" || typeof row.mac !== "string")
    throw new TypeError("measured / mac 는 문자열이어야 합니다.");
  for (const f of NUMBER_FIELDS)
    if (typeof row[f] !== "number" || !Number.isFinite(row[f]))
      throw new TypeError("수치 필드 '" + f + "' 는 유한한 숫자여야 합니다.");
  if (row.model.trim().length === 0) throw new RangeError("model 은 비어 있을 수 없습니다.");
  if (row.repo.trim().length === 0) throw new RangeError("repo 는 비어 있을 수 없습니다.");
  if (row.weights_gb <= 0) throw new RangeError("weights_gb 은 0보다 커야 합니다.");
  if (row.peak_memory_gb <= 0) throw new RangeError("peak_memory_gb 은 0보다 커야 합니다.");
  if (row.gen_tps_short < 0) throw new RangeError("gen_tps_short 은 음수일 수 없습니다.");
  if (row.gen_tps_long < 0) throw new RangeError("gen_tps_long 은 음수일 수 없습니다.");
  if (row.kmmlu_of_50 < 0 || row.kmmlu_of_50 > 50) throw new RangeError("kmmlu_of_50 은 0에서 50 사이여야 합니다.");
  for (const f of ["tools_of_10", "code_of_10", "format_of_10"])
    if (row[f] < 0 || row[f] > 10) throw new RangeError(f + " 은 0에서 10 사이여야 합니다.");
}

function validateQuery(query, modelNames) {
  if (!isPlainObject(query)) throw new TypeError("query 는 평범한 객체여야 합니다.");
  if (typeof query.memoryGb !== "number" || !Number.isFinite(query.memoryGb))
    throw new TypeError("memoryGb 는 유한한 숫자여야 합니다.");
  if (typeof query.category !== "string") throw new TypeError("category 는 문자열이어야 합니다.");
  if (!Array.isArray(query.comparePair)) throw new TypeError("comparePair 는 문자열 배열이어야 합니다.");
  if (!Array.isArray(query.savedIds)) throw new TypeError("savedIds 는 문자열 배열이어야 합니다.");
  if (!MEMORY_OPTIONS.includes(query.memoryGb))
    throw new RangeError("memoryGb 는 8, 16, 24, 32, 48, 64, 128 중 하나여야 합니다.");
  if (!CATEGORIES.includes(query.category))
    throw new RangeError("category 는 korean, coding, tools, speed 중 하나여야 합니다.");
  if (query.comparePair.length !== 0 && query.comparePair.length !== 2)
    throw new RangeError("comparePair 는 0개 또는 2개의 문자열이어야 합니다.");
  if (query.comparePair.length === 2) {
    const [a, b] = query.comparePair;
    if (typeof a !== "string" || typeof b !== "string")
      throw new TypeError("comparePair 항목은 문자열이어야 합니다.");
    if (a.trim().length === 0 || b.trim().length === 0)
      throw new RangeError("comparePair 항목은 비어 있을 수 없습니다.");
    if (a === b) throw new RangeError("comparePair 의 두 모델은 서로 달라야 합니다.");
    if (!modelNames.has(a) || !modelNames.has(b))
      throw new RangeError("comparePair 모델은 데이터에 존재해야 합니다.");
  }
  const seen = new Set();
  for (const id of query.savedIds) {
    if (typeof id !== "string") throw new TypeError("savedIds 항목은 문자열이어야 합니다.");
    if (id.trim().length === 0) throw new RangeError("savedIds 항목은 비어 있을 수 없습니다.");
    if (seen.has(id)) throw new RangeError("savedIds 에 중복된 모델이 있습니다.");
    seen.add(id);
  }
}

const rawOf = (row) => {
  const o = {};
  for (const f of RAW_FIELDS) o[f] = row[f];
  return o;
};

export function rankLocalModels(rawModels, query) {
  if (!Array.isArray(rawModels)) throw new TypeError("rawModels 는 배열이어야 합니다.");
  const names = new Set();
  for (const row of rawModels) {
    validateRawModel(row);
    if (names.has(row.model)) throw new RangeError("model 이름이 중복됩니다: " + row.model);
    names.add(row.model);
  }
  validateQuery(query, names);

  const eligible = rawModels.filter((m) => m.peak_memory_gb < query.memoryGb);
  const metric = PRIMARY_METRIC[query.category];
  eligible.sort((a, b) =>
    b[metric] - a[metric] ||
    b.gen_tps_short - a.gen_tps_short ||
    a.peak_memory_gb - b.peak_memory_gb ||
    a.model.localeCompare(b.model, "en"));
  const ranked = eligible.map((m, i) => ({
    rank: i + 1,
    ...rawOf(m),
    isSaved: query.savedIds.includes(m.model),
  }));

  let comparison = null;
  if (query.comparePair.length === 2) {
    const [la, ra] = query.comparePair;
    const left = rawModels.find((m) => m.model === la);
    const right = rawModels.find((m) => m.model === ra);
    comparison = {
      left: { ...rawOf(left), fitsMemory: left.peak_memory_gb < query.memoryGb },
      right: { ...rawOf(right), fitsMemory: right.peak_memory_gb < query.memoryGb },
      diff: {
        peak_memory_gb: Number((left.peak_memory_gb - right.peak_memory_gb).toFixed(3)),
        gen_tps_short: Number((left.gen_tps_short - right.gen_tps_short).toFixed(1)),
        gen_tps_long: Number((left.gen_tps_long - right.gen_tps_long).toFixed(1)),
        kmmlu_of_50: left.kmmlu_of_50 - right.kmmlu_of_50,
        code_of_10: left.code_of_10 - right.code_of_10,
        tools_of_10: left.tools_of_10 - right.tools_of_10,
        format_of_10: left.format_of_10 - right.format_of_10,
      },
    };
  }

  const savedModels = query.savedIds
    .map((id) => rawModels.find((m) => m.model === id))
    .filter(Boolean)
    .map((m) => ({ ...rawOf(m), fitsMemory: m.peak_memory_gb < query.memoryGb }));

  return {
    memoryGb: query.memoryGb,
    category: query.category,
    totalCount: rawModels.length,
    eligibleCount: ranked.length,
    ranked,
    comparison,
    savedModels,
  };
}
