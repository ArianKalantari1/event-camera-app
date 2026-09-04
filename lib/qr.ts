import qrcode from 'qrcode-generator';

/**
 * QR codes as inline SVG.
 *
 * Rendered on the server into a path, so a poster page needs no client
 * JavaScript and prints identically from any browser.
 *
 * Error correction stays at M rather than H. A denser code is harder to scan in
 * the light a venue actually has, and posters are replaced when damaged rather
 * than read through the damage. Short URLs are the real lever here: the whole
 * point of a six-character slug is that the code stays sparse.
 */

/** The spec requires four clear modules around the symbol or scanners miss it. */
const QUIET_ZONE = 4;

export interface QrSvg {
  /** A single path covering every dark module, in a 0 0 size size viewBox. */
  path: string;
  /** Width of the viewBox in modules, including the quiet zone. */
  size: number;
  /** Modules across the symbol itself, a rough density signal. */
  moduleCount: number;
}

export function qrSvg(text: string, errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M'): QrSvg {
  if (!text) throw new Error('qrSvg needs something to encode');

  // Type 0 asks the library for the smallest symbol that fits.
  const code = qrcode(0, errorCorrection);
  code.addData(text);
  code.make();

  const moduleCount = code.getModuleCount();
  const size = moduleCount + QUIET_ZONE * 2;

  let path = '';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!code.isDark(row, col)) continue;
      path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }

  return { path, size, moduleCount };
}
