// Submission Photo Fit — 순수 함수 (Node import 시에도 화면·저장소·전역 부작용 없음)

function _isSafeInt(v) { return typeof v === 'number' && Number.isSafeInteger(v); }
function _isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }

// 타입이 잘못된(숫자/문자가 아닌) 필드는 TypeError. 숫자 필드는 0·부수·소수·NaN·Infinity 는 RangeError.
function _posInt(v, name) {
  if (typeof v !== 'number') throw new TypeError(name + ' 은 숫자여야 합니다');
  if (!Number.isSafeInteger(v) || v <= 0) throw new RangeError(name + ' 은 1 이상의 정수여야 합니다');
  return v;
}
function _bytes(v) {
  if (typeof v !== 'number') throw new TypeError('bytes 는 숫자여야 합니다');
  if (!Number.isSafeInteger(v) || v < 0) throw new RangeError('bytes 는 0 이상의 정수여야 합니다');
  return v;
}
function _str(v, name, nonempty) {
  if (typeof v !== 'string') throw new TypeError(name + ' 은 문자여야 합니다');
  if (nonempty && v === '') throw new RangeError(name + ' 은 비어 있을 수 없습니다');
  return v;
}

/**
 * checkSubmissionPhoto(preset, source, output) — 기술 파일 규격(용량·크기·JPG) 통과 여부만 판단.
 * 통과해도 제출처의 사진 내용·인물 규정은 보장하지 않으므로 제출 전 공식 안내로 별도 확인이 필요합니다.
 *
 * preset: {maxKb, width, height, sourceUrl, appliesTo, checkedAt}
 * source: {width, height} (업로드 사진 픽셀)
 * output: {width, height, bytes, mimeType}
 * 반환: {limitBytes, safeLimitBytes, crop, upscaled, checks, pass} (이 키 순서)
 */
export function checkSubmissionPhoto(preset, source, output) {
  if (!_isObj(preset)) throw new TypeError('preset 은 객체여야 합니다');
  if (!_isObj(source)) throw new TypeError('source 는 객체여야 합니다');
  if (!_isObj(output)) throw new TypeError('output 은 객체여야 합니다');

  const maxKb = _posInt(preset.maxKb, 'maxKb');
  const pW = _posInt(preset.width, 'width');
  const pH = _posInt(preset.height, 'height');
  const sW = _posInt(source.width, 'width');
  const sH = _posInt(source.height, 'height');
  const oW = _posInt(output.width, 'width');
  const oH = _posInt(output.height, 'height');

  _str(preset.sourceUrl, 'sourceUrl', true);
  _str(preset.appliesTo, 'appliesTo', false);
  _str(preset.checkedAt, 'checkedAt', false);
  _str(output.mimeType, 'mimeType', false);

  const limitBytes = maxKb * 1000;
  const safeLimitBytes = maxKb * 980;

  // source 와 같은 비율의 가장 큰 중앙 크롭(정수)
  let crop;
  if (sW * pH >= sH * pW) {
    const w = Math.floor(sH * pW / pH);
    crop = { x: Math.floor((sW - w) / 2), y: 0, width: w, height: sH };
  } else {
    const h = Math.floor(sW * pH / pW);
    crop = { x: 0, y: Math.floor((sH - h) / 2), width: sW, height: h };
  }
  const upscaled = crop.width < pW || crop.height < pH;

  const bytes = _bytes(output.bytes);
  const checks = [
    { id: 'size', ok: bytes <= safeLimitBytes },
    { id: 'pixels', ok: oW === pW && oH === pH },
    { id: 'format', ok: output.mimeType === 'image/jpeg' },
  ];
  const pass = checks.every((c) => c.ok);

  return { limitBytes, safeLimitBytes, crop, upscaled, checks, pass };
}
