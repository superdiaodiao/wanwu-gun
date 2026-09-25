// 战绩图: a picture of the finished ball with how it went, to save and send (a long press on a phone).
// Drawn on a 2D canvas with the page's own fonts; the ball comes in as a transparent picture.

const W = 720, H = 1080;
const FIVE = ['#2aa198', '#d8342c', '#f2c14e', '#f4efe2', '#6a58c8'];

/**
 * card: { ball (canvas), size ('23.5 m'), title (big line under it), mode (e.g. 每日挑战 · 9月25日),
 * lines (up to 3 short lines), quote (女娲's words), url }
 */
export function shareCard(card) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2e2836');
  bg.addColorStop(1, '#17141b');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  // the five colours along the top
  FIVE.forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect((W / 5) * i, 0, W / 5 + 1, 10);
  });
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#f2c14e';
  x.font = '30px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  x.fillText('万物皆可滚 · 女娲补天', W / 2, 74);
  x.fillStyle = '#cfc6b4';
  x.font = '600 24px "PingFang SC", "Noto Sans SC", sans-serif';
  x.fillText(card.mode, W / 2, 114);
  // a glow behind the ball, then the ball
  const cy = 390, R = 250;
  const glow = x.createRadialGradient(W / 2, cy, 40, W / 2, cy, R * 1.25);
  glow.addColorStop(0, 'rgba(242, 193, 78, 0.28)');
  glow.addColorStop(1, 'rgba(242, 193, 78, 0)');
  x.fillStyle = glow;
  x.fillRect(0, cy - R * 1.3, W, R * 2.6);
  if (card.ball) x.drawImage(card.ball, W / 2 - R, cy - R, R * 2, R * 2);
  x.fillStyle = '#f6efe0';
  x.font = '800 112px "Baloo 2", "ZCOOL KuaiLe", sans-serif';
  x.fillText(card.size, W / 2, 760);
  x.fillStyle = '#f2c14e';
  x.font = '44px "ZCOOL KuaiLe", "PingFang SC", sans-serif';
  x.fillText(card.title, W / 2, 826);
  x.fillStyle = '#cfc6b4';
  x.font = '500 25px "PingFang SC", "Noto Sans SC", sans-serif';
  (card.lines || []).slice(0, 3).forEach((l, i) => x.fillText(l, W / 2, 878 + i * 36));
  if (card.quote) {
    x.fillStyle = '#9a90a4';
    x.font = '500 22px "PingFang SC", "Noto Sans SC", sans-serif';
    wrap(x, card.quote, W / 2, 878 + Math.min(3, (card.lines || []).length) * 36 + 12, W - 120, 30, 2);
  }
  x.fillStyle = 'rgba(246, 239, 224, 0.1)';
  x.fillRect(0, H - 74, W, 74);
  x.fillStyle = '#f6efe0';
  x.font = '600 23px "PingFang SC", "Noto Sans SC", sans-serif';
  x.fillText(`来挑战：${card.url}`, W / 2, H - 29);
  return c;
}

function wrap(x, text, cx, y, maxW, lh, maxLines) {
  let line = '', n = 0;
  for (const ch of text) {
    if (x.measureText(line + ch).width > maxW && line) {
      x.fillText(n === maxLines - 1 ? line.slice(0, -1) + '…' : line, cx, y);
      if (++n >= maxLines) return;
      y += lh;
      line = ch;
    } else line += ch;
  }
  if (line) x.fillText(line, cx, y);
}
