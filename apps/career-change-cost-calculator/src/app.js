// 순수 모듈: 이직준비 비용 계산. Node에서 import해도 화면/저장소/전역에 부작용이 없다.
// 이 파일의 evaluateRetraining은 순수 함수이며, index.html에서는 이 파일을 <script type="module">으로
// 불러와 module 전역 객체에 붙인 뒤 UI를 연결한다 (src/ui.js).

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// -0 감지: 0 이라 등가 비교(0 === -0)로는 -0/0 을 구별할 수 없어 부호 비트를 검사한다.
function isNegZero(v) {
  return v === 0 && 1 / v < 0;
}

function isNonNegativeSafeInt(v) {
  // number 타입, 정수, -0 과 음수 거부, safe-integer.
  if (typeof v !== 'number' || !Number.isInteger(v)) return false;
  if (isNegZero(v) || v < 0) return false;
  return Math.abs(v) <= MAX_SAFE;
}

// 정확히 2번째 자리에 반올림(away from zero). 0은 -0으로 바꾸지 않는다.
// SPEC: "All returned decimal values are rounded half away from zero to exactly 2 decimal places."
// 2⁵³(=2^53) 초과 값에서 Math.round(x*100)/100 은 *100 자체의 정밀도 오차로 값이 바뀌는
// "유령 반올림"을 일으킨다(예: round2(9007199254740990) → 9007199254740989). 이미 2째 자리
// 정수인 값은 원래 그대로 반환해야 하므로, 곱셈 대신 자릿수로 반올림한다:
//   floor(|v|*100 + 0.5) 는 100|v|가 정확히 표현되는 한 부호 방향으로 반올림을 정확히 재현한다
//   (정수는 100|v|가 짝수라 +0.5 후 floor는 100|v| 그대로).
function round2(v) {
  if (v === 0) return 0;
  const sign = v < 0 ? -1 : 1;
  const a = Math.abs(v);
  const scaled = a * 100; // 정수인 a 에 대해 항상 정확
  const rounded = Math.floor(scaled + 0.5); // away-from-zero
  const out = sign * (rounded / 100);
  return out === 0 ? 0 : out;
}

// 정수 값이면 정수로, 아니면 2번째 자리 숫자로 반환.
function wholeOr2(v) {
  return Number.isInteger(v) ? v : round2(v);
}

/**
 * 이직준비로 발생하는 순이익과 손익분기점을 계산한다.
 * @param {number} currentSalaryWon 현재 연봉(원/연)
 * @param {number} learningMonths 학습+취업 준비 월수
 * @param {number} targetSalaryWon 목표 직군 연봉(원/연)
 * @returns {object} {salaryLostWon, gainPerYearWon, yearsToRecoup, breakEvenAtMonth, netGainAt36mWon, roiAt36mPct} (이 키 순서)
 * @throws {TypeError} 인자가 number/양수(0포함)/정수/safe-integer를 만족하지 못할 때
 */
export function evaluateRetraining(currentSalaryWon, learningMonths, targetSalaryWon) {
  for (const [v, name] of [
    [currentSalaryWon, 'currentSalaryWon'],
    [learningMonths, 'learningMonths'],
    [targetSalaryWon, 'targetSalaryWon'],
  ]) {
    if (!isNonNegativeSafeInt(v)) {
      throw new TypeError(`${name} 은(는) 0 이상의 safe 정수여야 합니다 (received: ${v})`);
    }
  }

  const monthlyCurrentWon = currentSalaryWon / 12;
  const salaryLostWon = monthlyCurrentWon * learningMonths;
  const gainPerYearWon = targetSalaryWon - currentSalaryWon;

  const yearsToRecoupRaw = gainPerYearWon > 0 ? salaryLostWon / gainPerYearWon : null;
  const breakEvenAtMonthRaw = gainPerYearWon > 0 ? yearsToRecoupRaw * 12 : null;

  const netGainAt36mWon = gainPerYearWon * 3 - salaryLostWon;
  const roiAt36mPctRaw = salaryLostWon > 0 ? (netGainAt36mWon / salaryLostWon) * 100 : null;

  // 정확히 2번째 자리까지 반올림 (away from zero). null은 null로 유지.
  const yearsToRecoup = yearsToRecoupRaw === null ? null : round2(yearsToRecoupRaw);
  const breakEvenAtMonth = breakEvenAtMonthRaw === null ? null : round2(breakEvenAtMonthRaw);
  const roiAt36mPct = roiAt36mPctRaw === null ? null : round2(roiAt36mPctRaw);

  return {
    salaryLostWon: wholeOr2(salaryLostWon),
    gainPerYearWon: wholeOr2(gainPerYearWon),
    yearsToRecoup,
    breakEvenAtMonth,
    netGainAt36mWon: wholeOr2(netGainAt36mWon),
    roiAt36mPct,
  };
}
