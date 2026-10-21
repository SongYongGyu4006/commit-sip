// 상태: 기본 상태, 상태 검증, 저장 목록 추가/삭제, 가져온 JSON 해석 (순수 함수).
import { rankLocalModels } from "./app.js";

export const DEFAULT_STATE = { memoryGb: 16, category: "korean", comparePair: [], savedIds: [] };
const isPlainState = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

// 저장/가져온 상태를 표준 형태({memoryGb, category, comparePair, savedIds})로 검증·정리한다.
// models: data/local_llm_bench.json 의 models 배열. 실패하면 null.
export function normalizeState(saved, models) {
  if (!isPlainState(saved)) return null;
  const memoryGb = Number(saved.memoryGb);
  const query = {
    memoryGb,
    category: saved.category,
    comparePair: saved.comparePair,
    savedIds: saved.savedIds,
  };
  let result;
  try {
    result = rankLocalModels(models, query);
  } catch {
    return null;
  }
  return {
    memoryGb: result.memoryGb,
    category: result.category,
    comparePair: [...query.comparePair],
    savedIds: [...query.savedIds],
  };
}

// savedIds 에 model 이 있으면 제거, 없으면 추가 (순수). 실패하면 null.
export function toggleSaved(state, models, model) {
  if (typeof model !== "string") return null;
  const savedIds = state.savedIds.includes(model)
    ? state.savedIds.filter((id) => id !== model)
    : [...state.savedIds, model];
  return normalizeState({ ...state, savedIds }, models);
}

// savedIds 에서 model 을 삭제 (순수). 실패하면 null.
export function removeSaved(state, models, model) {
  if (typeof model !== "string") return null;
  const savedIds = state.savedIds.filter((id) => id !== model);
  return normalizeState({ ...state, savedIds }, models);
}

// 가져온 파일의 JSON(text)을 rankLocalModels query 로 검증해 표준 상태로 만든다. 실패하면 null.
export function parseImportedState(text, models) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainState(parsed)) return null;
  return normalizeState(parsed, models);
}
