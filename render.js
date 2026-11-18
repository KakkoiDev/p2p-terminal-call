/**
 * Terminal video helpers for p2p-terminal-call.
 *
 * frameRows turns an rgb24 frame into terminal rows of upper half blocks: each
 * cell shows two pixels, the top one as the foreground colour and the bottom
 * one as the background colour (24-bit colour escapes).
 *
 * splitter cuts a byte stream (ffmpeg's rawvideo output) into fixed-size frames.
 */

const HALF = '▀';

/** rgb24 pixels, width w, height h -> one string per pair of pixel rows. */
export function frameRows(rgb, w, h) {
  if (!rgb || rgb.length !== w * h * 3) return [];
  const rows = [];
  for (let y = 0; y < h; y += 2) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const t = (y * w + x) * 3;
      const b = ((y + 1) * w + x) * 3;
      const bottom = y + 1 < h ? `${rgb[b]};${rgb[b + 1]};${rgb[b + 2]}` : '0;0;0';
      line += `\x1b[38;2;${rgb[t]};${rgb[t + 1]};${rgb[t + 2]};48;2;${bottom}m${HALF}`;
    }
    rows.push(line + '\x1b[0m');
  }
  return rows;
}

/** Returns push(chunk); calls onFrame(Uint8Array of exactly size bytes) per full frame. */
export function splitter(size, onFrame) {
  let buf = new Uint8Array(size);
  let fill = 0;
  return (chunk) => {
    let i = 0;
    while (i < chunk.length) {
      const n = Math.min(size - fill, chunk.length - i);
      buf.set(chunk.subarray(i, i + n), fill);
      fill += n;
      i += n;
      if (fill === size) {
        onFrame(buf);
        buf = new Uint8Array(size);
        fill = 0;
      }
    }
  };
}
