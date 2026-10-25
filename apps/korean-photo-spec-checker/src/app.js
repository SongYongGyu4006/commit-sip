// 순수 함수: 입력 사진 메타데이터와 제출처 규격 객체를 검증하고
// EXIF 회전·대칭 변환, 4대 규격 통과 여부, 중앙 자르기 좌표, 목표 크기,
// 표준 출력 파일명을 부작용 없이 계산한다. (DOM·네트워크·전역 접근 없음)

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const isTrueDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(t.getTime())) return false;
  const [y, m, d] = s.split('-').map(Number);
  return t.getUTCFullYear() === y && t.getUTCMonth() + 1 === m && t.getUTCDate() === d;
};

// EXIF orientation 1~8 → 회전·대칭 변환 (앱은 이 순서로 픽셀을 변환한다)
const ORIENTATIONS = {
  1: { rotateDeg: 0, flipH: false, flipV: false },
  2: { rotateDeg: 0, flipH: true, flipV: false },
  3: { rotateDeg: 180, flipH: false, flipV: false },
  4: { rotateDeg: 0, flipH: false, flipV: true },
  5: { rotateDeg: 90, flipH: true, flipV: false },
  6: { rotateDeg: 90, flipH: false, flipV: false },
  // SPEC 표(7 = 270 + flipV)를 "회전→반전" 순서(아래 SPEC 근거 문장)대로 쓰면 (x,y)→(y,x)가
  // 되어 5번과 같은 결과가 된다. 8방향 정준 EXIF 시뮬레이션과 표를 함께 만족하려면 flipH만 사용.
  // 근거: NOTES.md (기계 점검 2차)
  7: { rotateDeg: 270, flipH: true, flipV: false },
  8: { rotateDeg: 270, flipH: false, flipV: false },
};

function validatePhoto(photo) {
  if (!isPlainObject(photo)) throw new TypeError('photo 는 일반 객체여야 합니다');
  if (typeof photo.fileName !== 'string') throw new TypeError('photo.fileName 은 문자열이어야 합니다');
  for (const key of ['width', 'height', 'sizeBytes', 'orientation']) {
    if (typeof photo[key] !== 'number') throw new TypeError('photo.' + key + ' 은 숫자여야 합니다');
    if (!Number.isSafeInteger(photo[key])) throw new RangeError('photo.' + key + ' 은 1 이상의 정수여야 합니다');
  }
  if (typeof photo.detectedMime !== 'string') throw new TypeError('photo.detectedMime 은 문자열이어야 합니다');

  const trimmedName = photo.fileName.trim();
  const dotIdx = trimmedName.lastIndexOf('.');
  if (dotIdx < 1 || dotIdx >= trimmedName.length - 1) {
    throw new RangeError('파일명에 마침표로 나뉘는 이름과 확장자가 필요합니다');
  }
  if (photo.width < 1 || photo.height < 1 || photo.sizeBytes < 1) {
    throw new RangeError('사진의 너비·높이·용량은 1 이상이어야 합니다');
  }
  if (photo.orientation < 1 || photo.orientation > 8) {
    throw new RangeError('EXIF 방향은 1~8 사이의 정수여야 합니다');
  }
  if (photo.detectedMime.trim() === '') throw new RangeError('파일을 해석할 수 없어 실제 형식을 알 수 없습니다');
}

function validateSpec(spec) {
  if (!isPlainObject(spec)) throw new TypeError('spec 은 일반 객체여야 합니다');
  for (const key of ['id', 'requiredExt', 'sourceUrl', 'verifiedDate']) {
    if (typeof spec[key] !== 'string') throw new TypeError('spec.' + key + ' 은 문자열이어야 합니다');
  }
  for (const key of ['targetWidth', 'targetHeight', 'ratioW', 'ratioH', 'maxBytes']) {
    if (typeof spec[key] !== 'number') throw new TypeError('spec.' + key + ' 은 숫자여야 합니다');
    if (!Number.isSafeInteger(spec[key])) throw new RangeError('spec.' + key + ' 은 1 이상의 정수여야 합니다');
  }
  if (typeof spec.limitInclusive !== 'boolean') throw new TypeError('spec.limitInclusive 은 true/false 여야 합니다');

  const id = spec.id.trim();
  if (!/^[a-z0-9_-]+$/.test(id)) throw new RangeError('제출처 식별자는 영문 소문자·숫자만 넣을 수 있어요. 예: toeic');
  const targetWidth = spec.targetWidth;
  const targetHeight = spec.targetHeight;
  const ratioW = spec.ratioW;
  const ratioH = spec.ratioH;
  if (targetWidth < 1 || targetHeight < 1 || ratioW < 1 || ratioH < 1) {
    throw new RangeError('규격의 픽셀·비율 값은 1 이상의 정수여야 합니다');
  }
  if (targetWidth * ratioH !== targetHeight * ratioW) {
    throw new RangeError('목표 크기가 비율과 맞지 않아요. 예: 300×400 은 3:4 와 맞아야 합니다');
  }
  if (spec.maxBytes < 1024 || spec.maxBytes > 10485760) {
    throw new RangeError('최대 용량은 1KB 이상 10MB 이하로 설정해 주세요');
  }
  const requiredExt = spec.requiredExt.trim().toLowerCase();
  if (requiredExt !== '.jpg' && requiredExt !== '.jpeg') {
    throw new RangeError('허용 확장자는 .jpg 또는 .jpeg 로만 설정할 수 있어요');
  }
  if (id !== 'custom') {
    if (spec.sourceUrl.trim() === '') throw new RangeError('직접 입력이 아닌 제출처에는 공식 안내 주소가 필요해요');
    if (!isTrueDate(spec.verifiedDate)) throw new RangeError('확인일은 2026-10-01 같은 형식으로 적어 주세요');
  }
}

/**
 * 입력 사진을 제출처 규격과 비교해 4가지 통과 여부(size/ratio/용량/확장자),
 * EXIF 회전·대칭, 중앙 자르기 좌표, 목표 크기, 출력 파일명을 계산한다.
 * @param {{fileName:string,width:number,height:number,sizeBytes:number,orientation:number,detectedMime:string}} photo
 * @param {{id:string,targetWidth:number,targetHeight:number,ratioW:number,ratioH:number,maxBytes:number,limitInclusive:boolean,requiredExt:string,sourceUrl:string,verifiedDate:string}} spec
 * @returns {object} SPEC과 같은 형태의 판정 결과
 */
export function evaluatePhotoSpec(photo, spec) {
  validatePhoto(photo);
  validateSpec(spec);

  const trimmedName = photo.fileName.trim();
  const dotIdx = trimmedName.lastIndexOf('.');
  const rawBase = trimmedName.slice(0, dotIdx);
  const actualExt = trimmedName.slice(dotIdx).toLowerCase();

  const orientation = photo.orientation;
  const swapped = orientation >= 5;
  const effectiveWidth = swapped ? photo.height : photo.width;
  const effectiveHeight = swapped ? photo.width : photo.height;
  const orient = ORIENTATIONS[orientation];
  const { rotateDeg, flipH, flipV } = orient;

  const maxBytes = spec.maxBytes;
  const sizeOk = effectiveWidth === spec.targetWidth && effectiveHeight === spec.targetHeight;
  const ratioOk = effectiveWidth * spec.ratioH === effectiveHeight * spec.ratioW;
  const kbOk = spec.limitInclusive ? photo.sizeBytes <= maxBytes : photo.sizeBytes < maxBytes;
  const extOk = photo.detectedMime === 'image/jpeg' && actualExt === spec.requiredExt.trim().toLowerCase();
  const allPassed = sizeOk && ratioOk && kbOk && extOk;

  let cropWidth;
  let cropHeight;
  if (effectiveWidth * spec.ratioH >= effectiveHeight * spec.ratioW) {
    cropHeight = effectiveHeight;
    cropWidth = Math.floor((effectiveHeight * spec.ratioW) / spec.ratioH);
  } else {
    cropWidth = effectiveWidth;
    cropHeight = Math.floor((effectiveWidth * spec.ratioH) / spec.ratioW);
  }
  const x = Math.floor((effectiveWidth - cropWidth) / 2);
  const y = Math.floor((effectiveHeight - cropHeight) / 2);

  const baseName = rawBase.replace(/\./g, '_');
  const outputFileName = baseName + '_' + spec.id.trim() + spec.requiredExt.trim().toLowerCase();

  return {
    effectiveWidth,
    effectiveHeight,
    orientationSwapped: swapped,
    rotateDeg,
    flipH,
    flipV,
    maxBytes,
    outputFileName,
    allPassed,
    checks: { sizeOk, ratioOk, kbOk, extOk },
    crop: { x, y, width: cropWidth, height: cropHeight },
    resize: { width: spec.targetWidth, height: spec.targetHeight },
  };
}
