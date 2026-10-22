// ZX Spectrum .TAP reader and BASIC detokeniser (also runs under Node).
const TOKENS = ['RND', 'INKEY$', 'PI', 'FN', 'POINT', 'SCREEN$', 'ATTR', 'AT', 'TAB', 'VAL$', 'CODE', 'VAL', 'LEN', 'SIN', 'COS', 'TAN',
  'ASN', 'ACS', 'ATN', 'LN', 'EXP', 'INT', 'SQR', 'SGN', 'ABS', 'PEEK', 'IN', 'USR', 'STR$', 'CHR$', 'NOT', 'BIN',
  'OR', 'AND', '<=', '>=', '<>', 'LINE', 'THEN', 'TO', 'STEP', 'DEF FN', 'CAT', 'FORMAT', 'MOVE', 'ERASE', 'OPEN #', 'CLOSE #',
  'MERGE', 'VERIFY', 'BEEP', 'CIRCLE', 'INK', 'PAPER', 'FLASH', 'BRIGHT', 'INVERSE', 'OVER', 'OUT', 'LPRINT', 'LLIST', 'STOP', 'READ', 'DATA',
  'RESTORE', 'NEW', 'BORDER', 'CONTINUE', 'DIM', 'REM', 'FOR', 'GO TO', 'GO SUB', 'INPUT', 'LOAD', 'LIST', 'LET', 'PAUSE', 'NEXT', 'POKE',
  'PRINT', 'PLOT', 'RUN', 'SAVE', 'RANDOMIZE', 'IF', 'CLS', 'DRAW', 'CLEAR', 'RETURN', 'COPY'];
const BLOCKS = ' ▝▘▀▗▐▚▜▖▞▌▛▄▟▙█';

export function parseTap(bytes) {
  const blocks = [];
  let i = 0;
  while (i + 2 <= bytes.length) {
    const len = bytes[i] | (bytes[i + 1] << 8); i += 2;
    const data = bytes.subarray(i, i + len); i += len;
    if (!data.length) continue;
    const flag = data[0];
    const body = data.subarray(1, data.length - 1); // strip flag and checksum
    if (flag === 0 && body.length === 17) {
      const type = body[0];
      const name = new TextDecoder('latin1').decode(body.subarray(1, 11)).trimEnd();
      const dataLen = body[11] | (body[12] << 8);
      const p1 = body[13] | (body[14] << 8), p2 = body[15] | (body[16] << 8);
      blocks.push({ kind: 'header', type: ['Program', 'Number array', 'Character array', 'Bytes'][type] || type, name, dataLen, p1, p2 });
    } else blocks.push({ kind: 'data', flag, body });
  }
  return blocks;
}

// A Spectrum BASIC program block -> text listing.
export function detokenise(body) {
  const out = [];
  let i = 0;
  while (i + 4 <= body.length) {
    const lineNo = (body[i] << 8) | body[i + 1];
    const len = body[i + 2] | (body[i + 3] << 8);
    i += 4;
    const end = Math.min(i + len, body.length);
    let s = '';
    let inString = false;
    while (i < end) {
      const c = body[i++];
      if (c === 0x0d) break;
      if (c === 0x0e) { i += 5; continue; } // hidden binary form of a number
      if (c === 0x22) { inString = !inString; s += '"'; continue; }
      if (c >= 0xa5) { const t = TOKENS[c - 0xa5]; s += (s.endsWith(' ') || s === '' || inString ? '' : ' ') + t + ' '; continue; }
      if (c === 0x60) { s += '£'; continue; }
      if (c === 0x7f) { s += '©'; continue; }
      if (c >= 0x80 && c <= 0x8f) { s += BLOCKS[c - 0x80]; continue; }
      if (c >= 0x90 && c <= 0xa4) { s += String.fromCharCode(c); continue; } // UDG, kept as its code
      if (c >= 0x10 && c <= 0x15) { i += 1; continue; } // embedded INK/PAPER/FLASH/BRIGHT/INVERSE/OVER control
      if (c === 0x16 || c === 0x17) { i += 2; continue; } // embedded AT/TAB
      if (c < 32) continue;
      s += String.fromCharCode(c);
    }
    out.push(`${lineNo} ${s.replace(/\s+$/, '').replace(/ +:/g, ':')}`);
    i = end;
  }
  return out.join('\n');
}

export function tapToListing(bytes) {
  const blocks = parseTap(bytes);
  const parts = [];
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind !== 'header') continue;
    const d = blocks[k + 1];
    if (b.type === 'Program' && d && d.kind === 'data') parts.push({ name: b.name, autostart: b.p1 < 32768 ? b.p1 : null, listing: detokenise(d.body) });
    else parts.push({ name: b.name, type: b.type, length: b.dataLen, address: b.p1 });
  }
  return parts;
}
