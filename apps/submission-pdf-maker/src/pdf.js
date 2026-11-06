// KoFilePDF — PDF 모듈: 이미지 디코딩(픽셀 크기 읽기), 예시 노이즈 이미지 생성,
// 각 페이지를 흰 배경 캔버스에서 JPEG 로 인코딩, A4 DCTDecode 이미지 페이지로 된 PDF Blob 생성.

// canvas.toBlob 을 promise 로 감싼다.
const toJpeg = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 인코딩에 실패했습니다'))), 'image/jpeg', quality)
  );

// 이미지 파일(또는 Blob)을 디코딩해 {name, width, height, bytes, blob} 반환.
// width/height 는 디코딩된 비트맵의 픽셀, bytes 는 file.size.
export async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg'; // 출력은 JPEG
  return { name, width: bitmap.width, height: bitmap.height, bytes: file.size, blob: new Blob([bitmap]) };
}

// 예시로 해 보기: 캔버스로 3장(1110x1480, 1110x740, 1110x1480)의 노이즈 이미지를 만든다.
export async function createExampleFiles() {
  const make = (name, w, h) =>
    new Promise((resolve, reject) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      // 8x8 블록 노이즈 + 큰 반점 몇 개 — JPEG 인코딩 크기가 예제마다 조금씩 다르면 된다.
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          const v = (Math.random() * 255) | 0;
          ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          ctx.fillRect(x, y, 8, 8);
        }
      }
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = 'rgb(' + ((Math.random() * 255) | 0) + ',' + ((Math.random() * 255) | 0) + ',' + ((Math.random() * 255) | 0) + ')';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 0, Math.PI * 2);
        ctx.fill();
      }
      c.toBlob((b) =>
        b ? resolve({ name, width: w, height: h, bytes: b.size, blob: b }) : reject(new Error('예시 이미지 생성에 실패했습니다')),
        'image/jpeg'
      );
    });
  return [
    await make('example-1.jpg', 1110, 1480),
    await make('example-2.jpg', 1110, 740),
    await make('example-3.jpg', 1110, 1480)
  ];
}

// 각 페이지를 계획(outWidthPx x outHeightPx, 흰 배경)에 맞춰 캔버스로 그려 JPEG(Blob)로 인코딩한다.
export async function encodePagesToJpeg(items, plan, quality) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const page = plan.pages[i];
    const c = document.createElement('canvas');
    c.width = page.outWidthPx;
    c.height = page.outHeightPx;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // 투명 부위는 흰 배경으로 깔린다(PNG 포함)
    ctx.fillRect(0, 0, c.width, c.height);
    const bitmap = await createImageBitmap(items[i].blob);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    out.push(await toJpeg(c, quality));
  }
  return out;
}

const b64Chunk = 2048;
function b64Encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += b64Chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + b64Chunk));
  return btoa(s);
}

function pad(n, len) {
  const s = String(Math.floor(n));
  return s.length >= len ? s : '0'.repeat(len - s.length) + s;
}

// JPEG 페이지들을 A4(595 x 842 pt) DCTDecode 이미지 페이지로 합쳐 PDF Blob 반환.
// 계획(plan)의 drawWidthPt/drawHeightPt/xPt/yPt 에 따라 중앙 배치한다.
export async function writePdf(items, plan, quality) {
  const jpegs = await encodePagesToJpeg(items, plan, quality);
  const parts = [];
  const offsets = [];
  const push = (s) => parts.push(s);
  const addBin = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += b64Chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + b64Chunk));
    parts.push(s);
  };
  const obj = (num, body) => {
    offsets[num] = parts.reduce((a, p) => a + p.length, 0);
    push(num + ' 0 obj\n');
    push(body);
    push('endobj\n');
  };
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>\n');
  obj(2, '<< /Type /Pages /Kids [' + plan.pages.map((p) => (1 + p.index) + ' 0 R').join(' ') + '] /Count ' + plan.pageCount + ' >>\n');
  for (let i = 0; i < plan.pageCount; i++) {
    const p = plan.pages[i];
    obj(1 + i, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im' + (i + 1) + ' ' + (3 + i) + ' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ' + (3 + plan.pageCount + i) + ' 0 R >>\n');
    obj(3 + i, '<< /Type /XObject /Subtype /Image /Width ' + p.outWidthPx + ' /Height ' + p.outHeightPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + (await jpegs[i].arrayBuffer()).byteLength + ' >>\nstream\n');
    addBin(new Uint8Array(await jpegs[i].arrayBuffer()));
    push('\nendstream\n');
    const stream =
      'q ' + p.drawWidthPt + ' 0 0 ' + p.drawHeightPt + ' ' + p.xPt + ' ' + p.yPt + ' cm /Im' + (i + 1) + ' Do Q';
    obj(3 + plan.pageCount + i, '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream\n');
  }
  let xref = 'xref\n0 ' + (plan.pageCount * 2 + 4) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= plan.pageCount * 2 + 3; i++) xref += pad(offsets[i], 10) + ' 00000 n \n';
  const xrefPos = parts.reduce((a, p) => a + p.length, 0) + xref.length;
  xref += 'trailer\n<< /Size ' + (plan.pageCount * 2 + 4) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF';
  parts.push(xref);
  const buf = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) buf[pos++] = p.charCodeAt(i);
  }
  return new Blob([buf], { type: 'application/pdf' });
}
