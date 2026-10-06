import qrcode from 'qrcode-generator';

export const QR_PREFIX = 'WAKEIFY:';

/** Random, unguessable payload for a printable Wakeify QR code. */
export function newQrPayload(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += alphabet[Math.floor(random() * alphabet.length)];
  return `${QR_PREFIX}${s}`;
}

export function qrMatches(expected: string, scanned: string): boolean {
  return expected.trim() === scanned.trim();
}

export type QrMatrix = { size: number; isDark: (row: number, col: number) => boolean };

export function qrMatrix(payload: string): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const size = qr.getModuleCount();
  return { size, isDark: (r, c) => qr.isDark(r, c) };
}

/** Single SVG path ("M x y h1 v1 h-1 z" per dark module) – compact and crisp at any size. */
export function qrSvgPath(payload: string): { size: number; d: string } {
  const m = qrMatrix(payload);
  let d = '';
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { size: m.size, d };
}

/** Standalone printable SVG document (quiet zone of 4 modules, caption below). */
export function qrSvgDocument(payload: string, caption: string): string {
  const { size, d } = qrSvgPath(payload);
  const q = 4;
  const total = size + q * 2;
  const esc = caption.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total + 6}" width="600" height="${Math.round((600 * (total + 6)) / total)}">
<rect width="100%" height="100%" fill="#fff"/>
<path transform="translate(${q} ${q})" d="${d}" fill="#000"/>
<text x="${total / 2}" y="${total + 3}" font-family="Helvetica, Arial, sans-serif" font-size="2.4" text-anchor="middle" fill="#111">${esc}</text>
</svg>`;
}
