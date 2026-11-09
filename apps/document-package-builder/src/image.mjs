// 사진·이미지 파일을 캔버스로 읽고, 박스를 검게 칠해 래스터화하며
// JPEG 품질·해상도를 조절한다. Node에서는 브라우저 DOM이 없어
// 호출 시 명확한 오류를 던질 뿐, 임포트 시 부작용이 없다.

function needDom() {
  if (typeof document === 'undefined') {
    throw new Error('이미지를 처리하려면 브라우저에서 열어 주세요.');
  }
}

// 이미지 파일을 캔버스로 읽는다. {canvas, w, h} (w·h는 캔버스 픽셀).
export function loadImageFile(file, maxSide = 1600) {
  needDom();
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ canvas, w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다. JPG·PNG 파일인지 확인해 주세요.'));
    };
    img.src = url;
  });
}

// 박스들(각각 {x,y,width,height} — 원본 픽셀 좌표)을 검게 칠한 새 캔버스를 만든다.
// 박스 좌표가 캔버스보다 크게 scale 배율(캔버스W/원본W)을 받아도 된다.
export function applyBoxes(srcCanvas, boxes, scale = 1) {
  needDom();
  const canvas = document.createElement('canvas');
  canvas.width = srcCanvas.width;
  canvas.height = srcCanvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.fillStyle = '#000000';
  for (const b of boxes) {
    if (!b) continue;
    const x = (b.x ?? 0) * scale;
    const y = (b.y ?? 0) * scale;
    const w = (b.width || 0) * scale;
    const h = (b.height || 0) * scale;
    if (w <= 0 || h <= 0) continue;
    ctx.fillRect(x, y, w, h);
  }
  return canvas;
}

// 캔버스를 JPEG 바이트로 변환한다. {bytes, w, h}
export function canvasToJpeg(canvas, quality = 0.85) {
  needDom();
  const blob = new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다.'))), 'image/jpeg', quality);
  });
  return blob.then((b) =>
    b
      .arrayBuffer()
      .then((buf) => ({ bytes: new Uint8Array(buf), w: canvas.width, h: canvas.height }))
  );
}

// 캔버스를 targetRatio(높이/넓이 비율)만큼 새 캔버스로 확대·축소한다.
export function scaleCanvas(srcCanvas, targetRatio) {
  needDom();
  if (!(targetRatio > 0) || targetRatio >= 1) {
    return srcCanvas;
  }
  const w = Math.max(1, Math.round(srcCanvas.width * targetRatio));
  const h = Math.max(1, Math.round(srcCanvas.height * targetRatio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  return canvas;
}
