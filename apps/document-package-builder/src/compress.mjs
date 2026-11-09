// JPEG 품질과 해상도를 단계적으로 낮춰 PDF가 목표 용량 이하가 될 때까지
// 다시 만들고, 최종 크기와 초과 여부를 돌려준다.

import { canvasToJpeg, scaleCanvas } from './image.mjs';
import { buildPdf } from './pdf.mjs';

const QUALITIES = [0.85, 0.7, 0.55, 0.4, 0.3, 0.22, 0.15];
const RESOLUTIONS = [1, 0.8, 0.65, 0.5, 0.4];

// pages: 각 {canvas, title} — 이미 박스를 검게 칠한 캔버스.
// targetBytes: 목표 바이트수. 초과하면 단계적으로 낮추며 반복한다.
export async function shrinkToTarget(pages, targetBytes) {
  let best = null;
  for (const q of QUALITIES) {
    for (const s of RESOLUTIONS) {
      const jpgs = [];
      for (const p of pages) {
        const c = s < 1 ? scaleCanvas(p.canvas, s) : p.canvas;
        jpgs.push(await canvasToJpeg(c, q));
      }
      const pdf = await buildPdf(jpgs.map((j) => ({ bytes: j.bytes, w: j.w, h: j.h })));
      const size = pdf.bytes.length;
      if (size <= targetBytes) {
        return { bytes: pdf.bytes, size, over: false };
      }
      if (!best || size < best.size) best = pdf;
    }
  }
  // 목표에 못 미쳤다면 가장 작은 결과를 돌려준다(화면에서 초과 경고).
  return { bytes: best.bytes, size: best.size, over: true };
}
