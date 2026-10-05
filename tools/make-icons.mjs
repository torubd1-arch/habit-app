// アイコン PNG を生成する開発用スクリプト（依存なし）。
// 実行：node tools/make-icons.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function makeIcon(size) {
  const bg = [0x2f, 0x7d, 0x5b];
  const fg = [0xff, 0xff, 0xff];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  // チェックマーク（全面塗り。iOS が角丸を付ける）
  const s = size;
  const a = [0.27 * s, 0.53 * s];
  const b = [0.44 * s, 0.69 * s];
  const c = [0.74 * s, 0.34 * s];
  const half = 0.06 * s;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      // 4x サンプリングで縁を滑らかにする
      let cover = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = x + (sx + 0.5) / 2;
          const py = y + (sy + 0.5) / 2;
          const d = Math.min(distToSegment(px, py, ...a, ...b), distToSegment(px, py, ...b, ...c));
          if (d <= half) cover++;
        }
      }
      const t = cover / 4;
      const o = row + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(bg[i] * (1 - t) + fg[i] * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('icon-192.png', outDir), makeIcon(192));
writeFileSync(new URL('icon-512.png', outDir), makeIcon(512));
writeFileSync(new URL('apple-touch-icon.png', outDir), makeIcon(180));
console.log('icons generated');
