// KoFilePDF — 순수 계산 모듈: A4 배치 계획(planPdf)과 목표 용량 문자열 검증(parseTargetMb).
// 이 모듈은 브라우저·전역·파일에 대한 부작용이 없으며 Node 에서 그대로 import 가능합니다.

const MB = 1048576; // 1MB(시바이트)

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// width/height/bytes 共用 규칙: number 타입 + 유한·양의 정수·safe integer
const checkPixels = (v, what) => {
  if (typeof v !== 'number') throw new TypeError(what + '은 number 타입이어야 합니다');
  if (!Number.isInteger(v) || v < 1 || v > Number.MAX_SAFE_INTEGER)
    throw new RangeError(what + '은 1 이상인 정수여야 합니다');
};

export function planPdf(files, targetMb) {
  if (!Array.isArray(files)) throw new TypeError('files는 배열이어야 합니다');
  const n = files.length;
  if (n === 0) throw new RangeError('files는 비어 있을 수 없습니다');
  for (const f of files) {
    if (!isPlainObject(f)) throw new TypeError('파일 항목은 일반 객체여야 합니다');
    if (typeof f.name !== 'string') throw new TypeError('name은 string 타입이어야 합니다');
    if (f.name.trim() === '') throw new RangeError('name은 빈 공백으로만 이루어질 수 없습니다');
    checkPixels(f.width, 'width');
    checkPixels(f.height, 'height');
    checkPixels(f.bytes, 'bytes');
  }
  if (typeof targetMb !== 'number') throw new TypeError('targetMb는 number 타입이어야 합니다');
  if (!Number.isFinite(targetMb) || targetMb <= 0 || targetMb > 100)
    throw new RangeError('targetMb는 0 초과 100 이하인 유한한 숫자여야 합니다');

  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  const targetBytes = Math.floor(targetMb * MB);
  const budgetBytes = Math.floor((targetBytes * 95) / 100); // 5% 여유
  const availableBytes = budgetBytes - (2000 + 1000 * n); // PDF 구조 오버헤드
  const ratio = availableBytes <= 0 ? 0 : availableBytes / totalBytes;

  // 축소 단계: level 0(유지)~4(최강 축소). level 이 초기 scale/quality 를 정하고,
  // 재시도 루프는 이 값(바닥)까지만 내려갈 수 있다. planPdf 는 인코더를 실행하지 않는다.
  const level = ratio >= 1 ? 0 : ratio >= 0.5 ? 1 : ratio >= 0.25 ? 2 : ratio >= 0.1 ? 3 : 4;
  const [scale, quality] = [[1, 1], [1, 0.75], [0.75, 0.7], [0.5, 0.6], [0.35, 0.5]][level];

  // A4 세로 595 x 842 pt, 여백 20pt → 내용 박스 555 x 802. 이미지는 내용 박스에 맞춤(확대 가능), 중앙 배치.
  const pages = files.map((f, i) => {
    const s = Math.min(555 / f.width, 802 / f.height);
    const drawWidthPt = Math.round(f.width * s);
    const drawHeightPt = Math.round(f.height * s);
    return {
      index: i + 1,
      name: f.name.trim(),
      drawWidthPt,
      drawHeightPt,
      xPt: Math.round((595 - drawWidthPt) / 2),
      yPt: Math.round((842 - drawHeightPt) / 2),
      outWidthPx: Math.max(1, Math.round(f.width * scale)),
      outHeightPx: Math.max(1, Math.round(f.height * scale))
    };
  });

  return {
    pageCount: n,
    totalBytes,
    targetBytes,
    budgetBytes,
    availableBytes,
    level,
    action: level === 0 ? 'keep' : 'reduce',
    scale,
    quality,
    feasible: availableBytes >= totalBytes,
    pages
  };
}

// 입력 칸 목표 용량 문자열 검증: /^[0-9]+(\.[0-9]+)?$/ 를 만족하고 0 < 값 <= 100 일 때 숫자 반환, 아니면 null.
export function parseTargetMb(text) {
  if (typeof text !== 'string') return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) return null;
  const v = Number(text);
  return v > 0 && v <= 100 ? v : null;
}
