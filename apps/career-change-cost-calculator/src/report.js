// 순수 모듈: 이직 결산 리포트를 1080×1350 캔버스(1페이지 이미지)로 그린다.
// 외부 라이브러리 없이 fillText 만으로 그린다. Node에서 import해도 DOM에 부작용이 없다.
// (캔버스는 renderReport가 호출될 때만 만든다 — import 시점에는 아무 일도 생기지 않는다.)

const W = 1080;
const H = 1350;
const MARGIN = 64;
const FONT_STACK = '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// 원 금액 포맷: ₩ + 1,000 단위 쉼표, 정수는 소수점 없이.
export function fmtWon(v) {
  if (v === null) return '—';
  const abs = Math.abs(v);
  return (v < 0 ? '₩-' : '₩') + abs.toLocaleString('ko-KR', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// 한 줄을 measureText로 직접 줄바꿈한다. widthPx 내에서 한 번에 안 되면 글자 단위 끊는다.
export function wrapText(ctx, text, maxWidthPx) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidthPx && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawWrapped(ctx, text, x, y, maxWidthPx, lineHeightPx, maxLines) {
  const lines = wrapText(ctx, text, maxWidthPx);
  for (let i = 0; i < lines.length && i < maxLines; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeightPx);
  }
  return lines.length * lineHeightPx;
}

/**
 * 결산 리포트를 캔버스에 그린다. Node에서는 실행해도 DOM·전역에 부작용이 없다
 * (canvas 생성은 document가 있을 때만 — 브라우저에서만 호출한다).
 *
 * @param {object} data { currentSalaryWon, months, targetSalaryWon, res, negoText }
 * @returns {HTMLCanvasElement} 1080×1350 캔버스
 */
export function renderReport({ currentSalaryWon, months, targetSalaryWon, res, negoText }) {
  if (typeof document === 'undefined') {
    throw new TypeError('renderReport는 브라우저(문서 환경)에서만 동작합니다.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const contentW = W - MARGIN * 2;

  // 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f3f5f8';
  ctx.fillRect(0, 0, W, 220);

  // 제목
  ctx.fillStyle = '#16202c';
  ctx.font = `800 52px ${FONT_STACK}`;
  ctx.fillText('이직 결산 리포트', MARGIN, 96);
  ctx.font = `400 24px ${FONT_STACK}`;
  ctx.fillStyle = '#5b6675';
  ctx.fillText('이직준비 비용 계산기 · 가입·저장·전송 없이 브라우저에서만 계산', MARGIN, 148);
  ctx.fillStyle = '#1f5eff';
  ctx.fillRect(MARGIN, 184, 120, 6);

  let y = 300;
  const row = (label, value, big) => {
    ctx.font = `400 24px ${FONT_STACK}`;
    ctx.fillStyle = '#5b6675';
    ctx.fillText(label, MARGIN, y);
    ctx.font = `${big ? 800 : 700} ${big ? 40 : 34}px ${FONT_STACK}`;
    ctx.fillStyle = '#16202c';
    ctx.fillText(value, W - MARGIN - ctx.measureText(value).width, y);
    y += big ? 64 : 52;
  };

  // 입력 3값
  row('현재 연봉', fmtWon(currentSalaryWon));
  row('이직준비 기간', `${months}개월`);
  row('목표 연봉', fmtWon(targetSalaryWon));
  y += 16;

  // 본전 개월 / 3년 순이익 (크게)
  const be = res.breakEvenAtMonth === null ? '—' : `${res.breakEvenAtMonth}개월`;
  row('본전까지', be, true);
  const net = res.netGainAt36mWon;
  const netLabel = net >= 0 ? '3년 순이익' : '3년 순손실';
  const netAbs = Math.abs(net).toLocaleString('ko-KR', { minimumFractionDigits: Number.isInteger(net) ? 0 : 2, maximumFractionDigits: 2 });
  const netValue = (net < 0 ? '-₩' : '₩') + netAbs;
  ctx.font = `400 24px ${FONT_STACK}`;
  ctx.fillStyle = '#5b6675';
  ctx.fillText(netLabel, MARGIN, y);
  ctx.font = `800 40px ${FONT_STACK}`;
  ctx.fillStyle = net < 0 ? '#c0392b' : '#16202c';
  ctx.fillText(netValue, W - MARGIN - ctx.measureText(netValue).width, y);
  y += 64;

  // 판단 한 줄
  let verdict;
  if (res.gainPerYearWon <= 0) verdict = '연봉이 오르지 않아 본전이 없습니다.';
  else if (res.breakEvenAtMonth !== null && res.breakEvenAtMonth <= 36) verdict = '3년 안에 본전을 찾을 수 있어요.';
  else verdict = '3년 안에 본전을 찾지 못해요.';
  ctx.font = `600 30px ${FONT_STACK}`;
  ctx.fillStyle = '#16202c';
  y += drawWrapped(ctx, verdict, MARGIN, y, contentW, 40, 2);

  // 협상 문장 일부
  if (negoText) {
    ctx.strokeStyle = '#e4e8ee';
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + 8);
    ctx.lineTo(W - MARGIN, y + 8);
    ctx.stroke();
    y += 40;
    ctx.font = `400 24px ${FONT_STACK}`;
    ctx.fillStyle = '#5b6675';
    ctx.fillText('협상 문장', MARGIN, y);
    y += 36;
    ctx.font = `400 26px ${FONT_STACK}`;
    ctx.fillStyle = '#16202c';
    y += drawWrapped(ctx, negoText, MARGIN, y, contentW, 36, 6);
  }

  // 푸터
  ctx.font = `400 20px ${FONT_STACK}`;
  ctx.fillStyle = '#5b6675';
  ctx.fillText('이직준비 비용 계산기 · ' + new Date().toLocaleDateString('ko-KR'), MARGIN, H - 40);
  return canvas;
}

// 캔버스를 PNG(Blob)로 변환해 이직결산.png 으로 내려받는다.
export function downloadReport(canvas) {
  const a = document.createElement('a');
  a.download = '이직결산.png';
  canvas.toBlob((blob) => {
    if (!blob) return;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
