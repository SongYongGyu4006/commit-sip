// 순수 모듈: 이직 타이밍 비교. 지금 이직 vs n개월 뒤 이직, 3년 총액 기준으로 비교한다.
// Node에서 import해도 화면/저장소/전역에 부작용이 없다.
import { evaluateRetraining } from './app.js';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// -0 감지: 0 이라 등가 비교(0 === -0)로는 -0/0 을 구별할 수 없어 부호 비트를 검사한다.
function isNegZero(v) {
  return v === 0 && 1 / v < 0;
}

function isNonNegativeSafeInt(v) {
  if (typeof v !== 'number' || !Number.isInteger(v)) return false;
  if (isNegZero(v) || v < 0) return false;
  return Math.abs(v) <= MAX_SAFE;
}

/**
 * 지금 이직과 n개월 뒤 이직의 3년 총액을 비교한다.
 *
 * - nowTotal   = evaluateRetraining(current, months, target) 의 3년 누적 = 현재 연봉 × 3 + netGainAt36mWon
 * - laterTotal = evaluateRetraining(current, months, target, months + wait) 의 3년 누적
 *   (기다리는 동안에는 현 직장에서 연봉이 (1 + raise%/100) 로 오르고, wait 개월이 지나야
 *    받는 성과급을 추가로 얻어 3년 총액이 커진다. 이직 준비가 더 길어지는 것은
 *   prepareMonths 증가로 이미 반영되어 있으므로 별도 지연 손실은 넣지 않는다.)
 *
 * @param {number} current  현재 연봉(원/연)
 * @param {number} months   이직준비(학습+취업 준비) 개월
 * @param {number} target   목표 직군 연봉(원/연)
 * @param {number} raise    현 직장 연봉 상승률(정수, %/년)
 * @param {number} bonus    wait 개월이 지나야 받는 성과급(원)
 * @param {number} wait     성과급·계약 만료까지 남은 개월(정수)
 * @returns {number} laterTotal - nowTotal. 양수면 "n개월 뒤 이직이 더 유리"
 * @throws {TypeError} 인자가 0 이상의 safe 정수가 아닐 때
 */
export function compareTiming(current, months, target, raise, bonus, wait) {
  for (const [v, name] of [
    [current, 'current'],
    [months, 'months'],
    [target, 'target'],
    [raise, 'raise'],
    [bonus, 'bonus'],
    [wait, 'wait'],
  ]) {
    if (!isNonNegativeSafeInt(v)) {
      throw new TypeError(`${name} 은(는) 0 이상의 safe 정수여야 합니다 (received: ${v})`);
    }
  }
  const r = raise / 100;
  const laterMonthly = current / 12 * (1 + r); // wait 동안 현 직장에서 월급(상승분 포함)
  // 기다린 동안 현 직장 총액(매월 월급 합, wait이 안전 정수라 합도 정확) + 성과급
  const workTotal = laterMonthly * wait + bonus;
  // 이직 시 준비 기간은 months + wait (기다린 시간도 준비 기간으로 쓴다)
  const delay = months + wait;
  const nowTotal = current * 3 + evaluateRetraining(current, months, target).netGainAt36mWon;
  const laterTotal = workTotal + evaluateRetraining(current, delay, target).netGainAt36mWon;
  return laterTotal - nowTotal;
}
