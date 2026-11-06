// Just enough PNG for the tests, with no packages: decode the 8-bit, non-interlaced RGB/RGBA/grey PNGs
// Chrome writes (canvas.toDataURL, Page.captureScreenshot) to RGBA, encode RGBA, and count the pixels two
// images differ in.
//   import { decodePng, encodePng, diffPng } from './png.mjs';
//   const { width, height, data } = decodePng(buf);            // data: Uint8Array, 4 bytes a pixel
//   fs.writeFileSync('x.png', encodePng(width, height, data));
//   diffPng(bufA, bufB, { tol: 0, out: 'd.png' })  -> { same, px, total, maxDelta, box: [x0, y0, x1, y1] | null, size? }
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let p = 8, width = 0, height = 0, depth = 0, type = 0, inter = 0, palette = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; inter = body[12]; }
    else if (kind === 'PLTE') palette = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || inter || !ch) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${inter})`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * ch, out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, i = x * ch;
      if (ch === 4) { out[o] = cur[i]; out[o + 1] = cur[i + 1]; out[o + 2] = cur[i + 2]; out[o + 3] = cur[i + 3]; }
      else if (ch === 3) { out[o] = cur[i]; out[o + 1] = cur[i + 1]; out[o + 2] = cur[i + 2]; out[o + 3] = 255; }
      else if (type === 3) { const k = cur[i] * 3; out[o] = palette[k]; out[o + 1] = palette[k + 1]; out[o + 2] = palette[k + 2]; out[o + 3] = 255; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[i]; out[o + 3] = ch === 2 ? cur[i + 1] : 255; }
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

function chunk(kind, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const kb = Buffer.from(kind, 'latin1'), crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([kb, body])) >>> 0);
  return Buffer.concat([len, kb, body, crc]);
}
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** how two PNGs differ: pixels with any channel more than tol apart. out: a PNG of B, faded, with the
 *  differing pixels in magenta */
export function diffPng(a, b, { tol = 0, out = null } = {}) {
  if (Buffer.compare(a, b) === 0) return { same: true, px: 0 };
  const A = decodePng(a), B = decodePng(b);
  if (A.width !== B.width || A.height !== B.height) return { same: false, px: -1, size: [`${A.width}x${A.height}`, `${B.width}x${B.height}`] };
  let px = 0, maxDelta = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  const vis = out ? new Uint8Array(B.data.length) : null;
  for (let i = 0, n = A.width * A.height; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2]), Math.abs(A.data[o + 3] - B.data[o + 3]));
    if (d > maxDelta) maxDelta = d;
    const hit = d > tol;
    if (hit) { px++; const x = i % A.width, y = (i / A.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (vis) {
      if (hit) { vis[o] = 255; vis[o + 1] = 0; vis[o + 2] = 255; }
      else { const g = (B.data[o] * 0.3 + B.data[o + 1] * 0.59 + B.data[o + 2] * 0.11) * 0.35 + 160; vis[o] = vis[o + 1] = vis[o + 2] = g; }
      vis[o + 3] = 255;
    }
  }
  if (vis && px) fs.writeFileSync(out, encodePng(B.width, B.height, vis));
  return { same: px === 0, px, total: A.width * A.height, maxDelta, box: px ? [x0, y0, x1, y1] : null };
}
