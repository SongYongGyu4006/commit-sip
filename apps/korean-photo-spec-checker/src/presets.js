// 한국 주요 제출처 프리셋. 바이트 한도는 서비스에서 공개한 값을 실제 바이트로
// 그대로 갖고(1024 배수만 2의 거듭제곱 한도), 한도 아래('이하')/아래('미만')
// 경계를 limitInclusive 로 구분한다. 각 항목은 공식 출처와 확인일을 가진다.

export const PRESETS = [
  {
    id: 'toeic',
    label: '토익 접수',
    targetWidth: 300,
    targetHeight: 400,
    ratioW: 3,
    ratioH: 4,
    maxBytes: 102400,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: 'https://exam.toeic.co.kr',
    verifiedDate: '2026-10-01',
  },
  {
    id: 'gov24',
    label: '정부24 민원',
    targetWidth: 413,
    targetHeight: 531,
    ratioW: 7,
    ratioH: 9,
    maxBytes: 512000,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: 'https://www.gov.kr',
    verifiedDate: '2026-10-01',
  },
  {
    id: 'gosi',
    label: '사이버국가고시센터',
    targetWidth: 354,
    targetHeight: 472,
    ratioW: 3,
    ratioH: 4,
    maxBytes: 102400,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: 'https://www.gosi.kr',
    verifiedDate: '2026-10-01',
  },
  {
    id: 'uway',
    label: '대입 원서',
    targetWidth: 300,
    targetHeight: 400,
    ratioW: 3,
    ratioH: 4,
    maxBytes: 204800,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: 'https://www.uwayapply.com',
    verifiedDate: '2026-10-01',
  },
  {
    id: 'resume',
    label: '사람인·잡코리아 이력서',
    targetWidth: 300,
    targetHeight: 400,
    ratioW: 3,
    ratioH: 4,
    maxBytes: 512000,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: 'https://www.saramin.co.kr',
    verifiedDate: '2026-10-01',
  },
  {
    id: 'passport',
    label: '여권 온라인 신청',
    targetWidth: 413,
    targetHeight: 531,
    ratioW: 7,
    ratioH: 9,
    maxBytes: 512000,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: 'https://www.passport.go.kr',
    verifiedDate: '2026-10-01',
  },
  {
    id: 'custom',
    label: '직접 입력',
    targetWidth: 300,
    targetHeight: 400,
    ratioW: 3,
    ratioH: 4,
    maxBytes: 102400,
    limitInclusive: true,
    requiredExt: '.jpg',
    sourceUrl: '',
    verifiedDate: '',
  },
];

// 모든 프리셋 (chip·규격표 순서)
export function getPresets() {
  return PRESETS.map((p) => ({ ...p }));
}

// id 로 찾기. 없는 id 는 null.
export function getPresetById(id) {
  const p = PRESETS.find((x) => x.id === id);
  return p ? { ...p } : null;
}

const isInt = (v) => Number.isSafeInteger(v) && v >= 1;

/**
 * 직접 입력 칸의 값으로 규격을 조립한다. 값이 하나라도 이상하면
 * (정수 아님, 비율 불일치, 1KB~10MB 밖, 확장자 .jpg/.jpeg 아님) null 을 돌려
 * 호출 쪽에서 마지막 유효 규격을 유지하게 한다.
 */
export function buildCustomSpec({ width, height, ratioW, ratioH, maxBytes, ext }) {
  if (![width, height, ratioW, ratioH, maxBytes].every(isInt)) return null;
  if (width * ratioH !== height * ratioW) return null;
  if (maxBytes < 1024 || maxBytes > 10485760) return null;
  const e = String(ext || '').trim().toLowerCase();
  if (e !== '.jpg' && e !== '.jpeg') return null;
  return {
    id: 'custom',
    label: '직접 입력',
    targetWidth: width,
    targetHeight: height,
    ratioW,
    ratioH,
    maxBytes,
    limitInclusive: true,
    requiredExt: e,
    sourceUrl: '',
    verifiedDate: '',
  };
}

// '300×400px · 3:4 · 100KiB 이하 · JPG' 같은 요약 문구
export function formatSpecSummary(spec) {
  const ki = spec.maxBytes / 1024;
  const kiText = Number.isInteger(ki) ? String(ki) : ki.toFixed(1);
  const unit = spec.maxBytes % 1048576 === 0 ? spec.maxBytes / 1048576 + 'MB' : kiText + 'KiB';
  return (
    spec.targetWidth + '×' + spec.targetHeight + 'px · ' +
    spec.ratioW + ':' + spec.ratioH + ' · ' +
    unit + (spec.limitInclusive ? ' 이하' : ' 미만') + ' · ' +
    spec.requiredExt.replace('.', '').toUpperCase()
  );
}
