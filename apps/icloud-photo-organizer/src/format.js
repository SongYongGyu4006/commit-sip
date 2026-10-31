// 표시 보조: 바이트 수를 GB·MB·B 글자로, 용량 비율을 막대 너비 퍼센트로.
export function fmt(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + 'GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + 'MB';
  return Math.round(b) + 'B';
}

// 막대 세그먼트의 style.width 값. 전체가 0이면 정확히 '0%'.
export function percent(part, total) {
  if (total <= 0) return '0%';
  return (part / total) * 100 + '%';
}
