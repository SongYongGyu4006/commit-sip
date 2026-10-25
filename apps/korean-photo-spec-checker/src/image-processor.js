// 브라우저 이미지 처리: 파일의 매직 바이트로 실제 형식 확인, EXIF 방향 읽기,
// 800×1000 예시 증명사진 합성, EXIF 제거 + 7단계 화질 이진 탐색 JPEG 변환.
// (모두 기기 안에서만 동작 — 파일 바이트는 어디로도 보내지 않는다)

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

function dataUrlToCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('파일을 이미지로 읽을 수 없습니다'));
    img.src = url;
  });
}

// 매직 바이트로 실제 MIME 을 확인한다. (확장자는 절대 신뢰하지 않음)
export function detectMime(bytes) {
  if (!(bytes && bytes.length >= 12)) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  }
  if (bytes[4] === 0x46 && bytes[5] === 0x4c && bytes[6] === 0x49 && bytes[7] === 0x46) {
    if (bytes[8] === 0x48 && bytes[9] === 0x45 && bytes[10] === 0x49 && bytes[11] === 0x43) return 'image/heic';
  }
  return '';
}

// EXIF 방향 태그 (0x0112) 읽기. 없으면 1.
function readExifOrientation(bytes) {
  const len = bytes.length;
  if (len < 4 || !(bytes[0] === 0xff && bytes[1] === 0xd8)) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, len);
  let off = 2;
  while (off + 4 < len) {
    const marker = view.getUint16(off);
    const size = view.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 < len) {
      if (String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]) !== 'Exif') return 1;
      const tiff = off + 10;
      if (tiff + 8 > len) return 1;
      const little = String.fromCharCode(bytes[tiff], bytes[tiff + 1]) === 'II';
      const g16 = (o) => view.getUint16(tiff + o, little);
      const g32 = (o) => view.getUint32(tiff + o, little);
      if (g16(0) !== 0x002a) return 1;
      const ifd = g32(2);
      if (ifd + 2 > len) return 1;
      const count = g16(2 + ifd);
      for (let i = 0; i < count; i += 1) {
        const entry = 2 + ifd + 2 + i * 12;
        if (entry + 12 > len) return 1;
        if (g16(entry) === 0x0112) {
          const v = g16(entry + 8);
          if (v >= 1 && v <= 8) return v;
          return 1;
        }
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || size < 2) return 1;
    off += 2 + size;
  }
  return 1;
}

// 파일 → {fileName, width, height, sizeBytes, orientation, detectedMime}
// 이미지로 해석 못 하면 null (호출 쪽에서 한국어 오류로 안내)
export async function inspectImageFile(file) {
  if (!file || typeof file !== 'object') return null;
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return null;
  }
  const bytes = new Uint8Array(buffer);
  const detectedMime = detectMime(bytes);
  if (!detectedMime) return null;
  let canvas;
  try {
    canvas = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('decode'));
      };
      img.src = url;
    });
  } catch {
    return null;
  }
  if (canvas.width < 1 || canvas.height < 1) return null;
  return {
    fileName: file.name,
    width: canvas.width,
    height: canvas.height,
    sizeBytes: file.size,
    orientation: readExifOrientation(bytes),
    detectedMime,
  };
}

// 800×1000 예시 증명사진을 캔버스에 합성한다 (EXIF 없는 새 JPEG 원본)
export function synthesizeSamplePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, 1000);
  bg.addColorStop(0, '#b9d2f0');
  bg.addColorStop(1, '#7fa8d9');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 1000);

  ctx.fillStyle = '#2f3e56'; // 상의
  ctx.beginPath();
  ctx.moveTo(120, 1000);
  ctx.quadraticCurveTo(150, 690, 400, 660);
  ctx.quadraticCurveTo(650, 690, 680, 1000);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2f5f9'; // 칼라
  ctx.beginPath();
  ctx.moveTo(360, 660);
  ctx.lineTo(400, 740);
  ctx.lineTo(440, 660);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e8b08b'; // 목과 얼굴
  ctx.fillRect(360, 560, 80, 120);
  ctx.beginPath();
  ctx.ellipse(400, 420, 155, 210, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3b2a1f'; // 머리카락
  ctx.beginPath();
  ctx.ellipse(400, 360, 170, 160, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(230, 330, 30, 220);
  ctx.fillRect(540, 330, 30, 220);

  ctx.fillStyle = '#2b2320'; // 눈
  ctx.beginPath();
  ctx.ellipse(340, 430, 14, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(460, 430, 14, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8c5a3c';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(400, 500, 36, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  return canvas;
}

// 캔버스의 실제 JPEG 인코딩: 성공 여부 + 크기 + 매직 바이트로 재확인한 MIME
function encodeCanvas(canvas, quality) {
  return new Promise((resolve) => {
    const fail = (error) => resolve({ ok: false, error, sizeBytes: 0, mime: '', blob: null });
    if (!canvas || !canvas.getContext) {
      fail('canvas 미지원');
      return;
    }
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fail('인코더 오류');
            return;
          }
          blob
            .arrayBuffer()
            .then((buf) => {
              const bytes = new Uint8Array(buf);
              const mime = detectMime(bytes);
              resolve({
                ok: blob.type === 'image/jpeg',
                error: null,
                sizeBytes: bytes.length,
                mime,
                blob,
              });
            })
            .catch(() => fail('인코더 오류'));
        },
        'image/jpeg',
        quality,
      );
    } catch {
      fail('인코더 오류');
    }
  });
}

// EXIF 방향을 적용한 뒤에 규격에 맞게 중앙 자르기 + 리사이즈해 JPEG 로 변환한다.
// (canvas 재인코딩은 EXIF 를 제거한다)
//
// 각 방향별 명시 변환(축 스왑 포함)으로 정준 EXIF 시각 결과를 그대로 재현한다.
// 5/7은 대각선 대칭(transpose/transverse)이라 회전+대칭 조합으로만 표현하면
// 중심 대칭이 자기 자신과 같아지는 그림자(미러)가 되므로, 8 방향을 전부 명시한다.
export function applyTransformToCanvas(canvas, { rotateDeg, flipH, flipV }) {
  const out = document.createElement('canvas');
  const W = canvas.width;
  const H = canvas.height;
  const c90 = rotateDeg === 90 || rotateDeg === 270;
  out.width = c90 ? H : W;
  out.height = c90 ? W : H;
  const ctx = out.getContext('2d');
  if (rotateDeg === 0 && flipH && !flipV) {
    // 방향 2: 좌우 대칭
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0);
  } else if (rotateDeg === 0 && flipV && !flipH) {
    // 방향 4: 상하 대칭
    ctx.translate(0, H);
    ctx.scale(1, -1);
    ctx.drawImage(canvas, 0, 0);
  } else if (rotateDeg === 180) {
    // 방향 3: 180도 회전
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
    ctx.drawImage(canvas, 0, 0);
  } else if (rotateDeg === 90 && flipH && !flipV) {
    // 방향 5: transpose (대각선 대칭) — 원본 (x,y) → (y,x)
    ctx.translate(0, H);
    ctx.scale(1, -1);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(canvas, 0, 0);
  } else if (rotateDeg === 90) {
    // 방향 6: 90도 시계 방향 회전 — 원본 (x,y) → (H-1-y, x)
    // rotate→translate 순서: translate 가 먼저 적용되어 원본을 (0,-W) 에 두고 나서 시계 방향 90도.
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, 0, -W);
  } else if (rotateDeg === 270 && flipH && !flipV) {
    // 방향 7: transverse (부대각선 대칭) — 원본 (x,y) → (H-1-y, W-1-x)
    // (app.js 표의 방향 7은 270도 회전+좌우 대칭. canvas 연산은 순서를 바꿔
    // 반시계 90도 회전 후 상하 대칭으로 같은 변환을 그린다.)
    ctx.translate(0, -H);
    ctx.scale(1, -1);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(canvas, 0, 0);
  } else if (rotateDeg === 270) {
    // 방향 8: 90도 반시계 방향 회전 — 원본 (x,y) → (y, W-1-x)
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(canvas, 0, -H);
  } else {
    // 방향 1: 그대로
    ctx.drawImage(canvas, 0, 0);
  }
  return out;
}

export function cropResizeCanvas(source, crop, resize) {
  const out = document.createElement('canvas');
  out.width = resize.width;
  out.height = resize.height;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, resize.width, resize.height);
  return out;
}

/**
 * 7단계 화질 이진 탐색 (0.10~0.92)으로 maxBytes 에 맞는 JPEG 를 만든다.
 * @returns {Promise<{ok:boolean, error?:string, sizeBytes:number, mime:string, quality:number|null, blob:Blob|null, url:string|null, result:object|null}>}
 */
export async function compressAndConvertJpeg(canvas, spec, result) {
  const QUALITY_STEPS = [0.92, 0.51, 0.4, 0.28, 0.18, 0.13, 0.1];
  const oriented = applyTransformToCanvas(canvas, result);
  const fitted = cropResizeCanvas(oriented, result.crop, result.resize);

  let last = null;
  for (const q of QUALITY_STEPS) {
    last = await encodeCanvas(fitted, q);
    if (last.ok && last.mime === 'image/jpeg' && last.sizeBytes < spec.maxBytes) {
      const url = URL.createObjectURL(last.blob);
      return {
        ok: true,
        error: null,
        sizeBytes: last.sizeBytes,
        mime: last.mime,
        quality: q,
        blob: last.blob,
        url,
        result: { ...result, sizeBytes: last.sizeBytes },
      };
    }
  }
  return {
    ok: false,
    error: '인코더 오류',
    sizeBytes: last ? last.sizeBytes : 0,
    mime: last ? last.mime : '',
    quality: null,
    blob: null,
    url: null,
    result: null,
  };
}
