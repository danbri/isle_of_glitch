// CodeMirror 5 mode for the Spectrum-flavoured BASIC.
export function defineZxBasicMode(CodeMirror) {
  const kw = 'LET|PRINT|INPUT|IF|THEN|ELSE|FOR|TO|STEP|NEXT|GO ?TO|GO ?SUB|RETURN|STOP|END|CLS|INK|PAPER|BORDER|BRIGHT|FLASH|INVERSE|OVER|PLOT|DRAW|CIRCLE|PAUSE|BEEP|RANDOMI[SZ]E|DIM|POKE|CLEAR|RUN|REPEAT|UNTIL|WHILE|WEND|RECT|DATA|READ|RESTORE|FX|FXP|SPRITE|EMOJI|WRAP|LOAD|SAVE|VERIFY|MERGE|CAT|FORMAT|MOVE|ERASE|OPEN|CLOSE|LPRINT|LLIST|COPY|CONTINUE|OUT|DEF FN|BIN|AT|TAB|AND|OR|NOT|LINE|NEW|LIST';
  const fns = 'RND|INT|ABS|SGN|SQR|SIN|COS|TAN|ATN|ASN|ACS|EXP|LN|LEN|STR\\$|VAL\\$|VAL|CHR\\$|CODE|INKEY\\$|PI|PEEK|IN|USR|ATTR|POINT|SCREEN\\$|FN|MOUSEX|MOUSEY|TICKS';
  CodeMirror.defineSimpleMode('zxbasic', {
    start: [
      { regex: /^\s*\d+/, token: 'lineno', sol: true },
      { regex: /REM\b.*/i, token: 'comment' },
      { regex: /"(?:[^"]|"")*"?/, token: 'string' },
      { regex: new RegExp('(?:' + kw + ')(?![A-Za-z0-9_$])', 'i'), token: 'keyword' },
      { regex: new RegExp('(?:' + fns + ')(?![A-Za-z0-9_$])', 'i'), token: 'builtin' },
      { regex: /#[0-9a-fA-F]+|0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/, token: 'number' },
      { regex: /[A-Za-z_][A-Za-z0-9_]*\$?/, token: 'variable' },
      { regex: /<=|>=|<>|[-+*\/^=<>(),;:']/, token: 'operator' },
    ],
    meta: { lineComment: 'REM' },
  });
}
