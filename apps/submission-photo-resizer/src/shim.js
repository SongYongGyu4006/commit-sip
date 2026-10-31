// 브라우저 classic 스크립트용 shim: src/app.js(ESM, export)를 <script> 로 불러오기 전
// window.checkSubmissionPhoto 를 먼저 정의해 'Unexpected token export' 를 막는다.
// Node import(테스트)에는 영향이 없다. 실제 구현은 src/app.js(export)와 이 파일에 동일하게 들어 있다.
(function () {
  'use strict';
  function _isSafeInt(v) { return typeof v === 'number' && Number.isSafeInteger(v); }
  function _isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
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
  window.checkSubmissionPhoto = function (preset, source, output) {
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
  };
})();
