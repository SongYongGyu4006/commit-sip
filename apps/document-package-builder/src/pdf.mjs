// pdf.js로 PDF 쪽 텍스트·캔버스 렌더를 얻고, pdf-lib으로 이미지 쪽들을 하나의 PDF로 묶는다.
// Node(테스트)에서는 pdf.js·pdf-lib 전역이 없어 호출 시 명확한 오류를 던질 뿐,
// 임포트 시점에 부작용이 없다.

function needPdfJs() {
  if (typeof globalThis.pdfjsLib === 'undefined') {
    throw new Error('pdf.js 라이브러리가 없어 PDF를 읽을 수 없습니다.');
  }
  return globalThis.pdfjsLib;
}

function needPdfLib() {
  if (typeof globalThis.PDFLib === 'undefined') {
    throw new Error('pdf-lib 라이브러리가 없어 PDF를 만들 수 없습니다.');
  }
  return globalThis.PDFLib;
}

function pageDims(page) {
  let vp = page.getViewport({ scale: 1 });
  let w = vp.width;
  let h = vp.height;
  if (w < h) {
    const t = w;
    w = h;
    h = t;
  }
  return { w, h };
}

async function pageToItems(page, scale) {
  const tc = await page.getTextContent();
  let items = tc.items;
  if (scale && scale !== 1) {
    items = items.map((it) => ({
      str: it.str,
      x: it.transform[4] * scale,
      y: it.transform[5] * scale,
      width: (it.width || 0) * scale,
      height: (it.height || 0) * scale,
    }));
  }
  return items.filter((it) => Number.isFinite(it.x) && Number.isFinite(it.y));
}

// PDF 파일에서 쪽 목록을 읽는다. 각 쪽은 {page, w, h, items}.
export async function readPdfPages(file, scale = 1) {
  const lib = needPdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { w, h } = pageDims(page);
    const items = await pageToItems(page, scale);
    pages.push({ page: i, w, h, items });
  }
  await doc.destroy?.();
  return pages;
}

// PDF 쪽을 캔버스에 그려 돌려준다(이미지 래스터화 — 원문 텍스트가 픽셀로 바뀜).
export async function renderPageToCanvas(file, page, scale, quality) {
  const lib = needPdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const p = await doc.getPage(page);
    const vp = p.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await p.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    return canvas;
  } finally {
    await doc.destroy?.();
  }
}

// PDF 쪽을 캔버스로만 렌더한다(renderPageToCanvas와 다름: 원본 PDF 파일을 다시 읽지 않고
// 이미 불러온 pdf.js 문서 객체를 재사용해 빠르게 뺀다).
export async function pdfToCanvas(doc, page, scale) {
  needPdfJs();
  const p = await doc.getPage(page);
  const vp = p.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await p.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas;
}

// JPEG 쪽(각각 {bytes, w, h})들을 하나의 PDF로 묶는다.
// 각 쪽은 A4 종이에 중앙 정렬·비율 유지. {bytes, pageW, pageH} 돌려준다.
export async function buildPdf(jpgPages) {
  const { PDFDocument, standardFonts } = needPdfLib();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(standardFonts.Helvetica);
  const pageW = 595.28;
  const pageH = 841.89;
  for (const jp of jpgPages) {
    const img = await pdf.embedJpg(jp.bytes);
    const ratio = Math.min((pageW * 0.92) / jp.w, (pageH * 0.92) / jp.h);
    const dw = jp.w * ratio;
    const dh = jp.h * ratio;
    const page = pdf.addPage([pageW, pageH]);
    page.drawImage(img, {
      x: (pageW - dw) / 2,
      y: (pageH - dh) / 2,
      width: dw,
      height: dh,
    });
    // 제목 행(문자열은 그대로, 헬베티카로)
    if (jp.title) {
      const t = String(jp.title);
      const size = 11;
      let w = 0;
      for (const ch of t) w += font.widthOfTextAtSize(ch, size);
      page.drawText(t, { x: (pageW - w) / 2, y: pageH - 28, size, font });
    }
  }
  const bytes = new Uint8Array(await pdf.save());
  return { bytes, pageW, pageH };
}
