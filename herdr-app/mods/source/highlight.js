// Line tokenizer for diff previews. Regex-based, with block-comment state carried
// between lines of the same side, so it never needs the whole file.

const C_KEYWORDS = 'abstract as async await break case catch class const continue debugger default defer delete do else enum export extends final finally fn for from func function go goto if impl implements import in instanceof interface internal let loop match mod module move mut namespace new of override package private protected pub public readonly return select static struct super switch throw throws trait try type typeof union unsafe use using var void where while with yield';
const HASH_KEYWORDS = 'and as assert async await begin break case class continue def del do done elif else end esac except export fi finally for from function global if import in is lambda local nonlocal not or pass raise return then try unless until when while with yield param foreach switch';
const SQL_KEYWORDS = 'add all alter and as asc begin between by case check column commit constraint create cross default delete desc distinct drop else end exists foreign from full group having if in index inner insert into is join key left like limit not null offset on or order outer primary references returning right rollback select set table then transaction union unique update using values view when where with';
const CONSTANTS = new Set('true false null undefined nil None True False NaN Infinity self this Self'.split(' '));

const LANGUAGES = {
  c: { line: ['//'], block: ['/*', '*/'], strings: `'"\``, keywords: new Set(C_KEYWORDS.split(' ')) },
  hash: { line: ['#'], strings: `'"`, keywords: new Set(HASH_KEYWORDS.split(' ')), variables: true },
  sql: { line: ['--'], block: ['/*', '*/'], strings: `'"`, keywords: new Set(SQL_KEYWORDS.split(' ')), caseless: true },
  lua: { line: ['--'], strings: `'"`, keywords: new Set('and break do else elseif end for function goto if in local not or repeat return then until while'.split(' ')) },
  json: { line: ['//'], strings: '"', keywords: new Set(), keys: true },
  css: { block: ['/*', '*/'], line: [], strings: `'"`, keywords: new Set('important media import supports keyframes font-face'.split(' ')), css: true },
  markup: { markup: true },
  markdown: { markdown: true },
};

const EXTENSIONS = {
  c: 'js jsx mjs cjs ts tsx mts cts java c h cc cpp hpp cxx cs go rs swift kt kts scala dart php groovy zig v proto',
  hash: 'py pyi sh bash zsh fish ps1 psm1 rb yml yaml toml ini conf cfg mk make dockerfile tf nix r pl properties env gitignore editorconfig',
  sql: 'sql psql',
  lua: 'lua',
  json: 'json jsonc json5 lock',
  css: 'css scss sass less',
  markup: 'html htm xml svg vue svelte xaml csproj plist',
  markdown: 'md mdx markdown',
};
const BY_EXTENSION = Object.fromEntries(Object.entries(EXTENSIONS).flatMap(([language, list]) => list.split(' ').map(ext => [ext, language])));

export function languageFor(path = '') {
  const name = path.split(/[\\/]/).pop().toLowerCase();
  if (['makefile', 'dockerfile', '.gitignore', '.zshrc', '.bashrc', '.profile', '.env'].includes(name)) return 'hash';
  if (['.vimrc', '.psqlrc', '.gitconfig'].includes(name)) return name === '.psqlrc' ? 'sql' : 'hash';
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return BY_EXTENSION[ext] ?? null;
}

const WORD = /[A-Za-z_$][\w$]*/y, NUMBER = /(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z%]*/y;

function push(tokens, kind, text) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) last.text += text;
  else tokens.push({ kind, text });
}

function stringEnd(line, start, quote) {
  for (let i = start + 1; i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === quote) return i + 1;
  }
  return line.length;
}

function markup(line, state) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    if (state.comment) {
      const end = line.indexOf('-->', i);
      const stop = end < 0 ? line.length : end + 3;
      push(tokens, 'comment', line.slice(i, stop)); i = stop;
      if (end >= 0) state.comment = false;
      continue;
    }
    if (line.startsWith('<!--', i)) { state.comment = true; continue; }
    if (state.tag || line[i] === '<') {
      if (!state.tag) {
        const m = /<\/?[\w:.-]*/y; m.lastIndex = i;
        const found = m.exec(line);
        push(tokens, 'punctuation', found[0].match(/^<\/?/)[0]); push(tokens, 'tag', found[0].replace(/^<\/?/, ''));
        i += found[0].length; state.tag = true; continue;
      }
      if (line[i] === '>' || line.startsWith('/>', i)) { const s = line[i] === '>' ? '>' : '/>'; push(tokens, 'punctuation', s); i += s.length; state.tag = false; continue; }
      if (line[i] === '"' || line[i] === "'") { const end = stringEnd(line, i, line[i]); push(tokens, 'string', line.slice(i, end)); i = end; continue; }
      const m = /[\w:@.#-]+/y; m.lastIndex = i;
      const found = m.exec(line);
      if (found) { push(tokens, 'attribute', found[0]); i += found[0].length; continue; }
      push(tokens, line[i] === '=' ? 'operator' : 'plain', line[i]); i++; continue;
    }
    const next = line.slice(i).search(/<|&/);
    const stop = next < 0 ? line.length : i + Math.max(next, 1);
    if (line[i] === '&') { const m = /&[#\w]+;?/y; m.lastIndex = i; const found = m.exec(line); if (found) { push(tokens, 'constant', found[0]); i += found[0].length; continue; } }
    push(tokens, 'plain', line.slice(i, stop)); i = stop;
  }
  return tokens;
}

function markdown(line, state) {
  if (/^\s*(```|~~~)/.test(line)) { state.fence = !state.fence; return [{ kind: 'comment', text: line }]; }
  if (state.fence) return [{ kind: 'string', text: line }];
  const heading = /^(\s*#{1,6}\s)(.*)$/.exec(line);
  if (heading) return [{ kind: 'punctuation', text: heading[1] }, { kind: 'heading', text: heading[2] }];
  const tokens = [];
  const pattern = /(`[^`]+`)|(\[[^\]]*\]\([^)]*\))|(\*\*[^*]+\*\*)|(^\s*(?:[-*+]|\d+\.)\s)|(^\s*>)/g;
  let last = 0, m;
  while ((m = pattern.exec(line))) {
    push(tokens, 'plain', line.slice(last, m.index));
    push(tokens, m[1] ? 'string' : m[2] ? 'function' : m[3] ? 'heading' : 'punctuation', m[0]);
    last = m.index + m[0].length;
    if (m[0].length === 0) pattern.lastIndex++;
  }
  push(tokens, 'plain', line.slice(last));
  return tokens;
}

/** Tokens for one line: [{kind, text}], concatenating back to the line. */
export function tokenize(line, language, state = {}) {
  const spec = LANGUAGES[language];
  if (!spec || !line) return [{ kind: 'plain', text: line }];
  if (spec.markup) return markup(line, state);
  if (spec.markdown) return markdown(line, state);
  const tokens = [];
  let i = 0, previous = '';
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf(spec.block[1], i);
      const stop = end < 0 ? line.length : end + spec.block[1].length;
      push(tokens, 'comment', line.slice(i, stop)); i = stop;
      if (end >= 0) state.block = false;
      continue;
    }
    const ch = line[i];
    if (spec.block && line.startsWith(spec.block[0], i)) { state.block = true; continue; }
    if (spec.line.some(marker => line.startsWith(marker, i)) && !(ch === '#' && language === 'hash' && /[\w$]/.test(line[i - 1] ?? ''))) {
      push(tokens, 'comment', line.slice(i)); break;
    }
    if (spec.strings.includes(ch)) {
      const end = stringEnd(line, i, ch);
      const text = line.slice(i, end);
      const isKey = spec.keys && /^\s*:/.test(line.slice(end));
      push(tokens, isKey ? 'property' : 'string', text); i = end; previous = 'value'; continue;
    }
    if (/\s/.test(ch)) { const m = /\s+/y; m.lastIndex = i; const s = m.exec(line)[0]; push(tokens, 'plain', s); i += s.length; continue; }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(line[i + 1] ?? ''))) {
      NUMBER.lastIndex = i; const found = NUMBER.exec(line);
      if (found && !/[\w$]/.test(line[i - 1] ?? '')) { push(tokens, 'number', found[0]); i += found[0].length; previous = 'value'; continue; }
    }
    if (spec.css && ch === '#' ) { const m = /#[\da-fA-F]{3,8}\b/y; m.lastIndex = i; const found = m.exec(line); if (found) { push(tokens, 'number', found[0]); i += found[0].length; continue; } }
    if (spec.variables && ch === '$') { const m = /\$(?:\{[^}]*\}|[\w]+|.)/y; m.lastIndex = i; const found = m.exec(line); push(tokens, 'variable', found[0]); i += found[0].length; continue; }
    if (spec.css && ch === '@') { const m = /@[\w-]+/y; m.lastIndex = i; const found = m.exec(line); if (found) { push(tokens, 'keyword', found[0]); i += found[0].length; continue; } }
    if (spec.css && /[a-zA-Z-]/.test(ch)) {
      const m = /-?[a-zA-Z][\w-]*/y; m.lastIndex = i; const found = m.exec(line)[0];
      const rest = line.slice(i + found.length);
      push(tokens, /^\s*:(?!:)/.test(rest) && !/[{,]\s*$/.test(rest) && /;\s*$|^\s*:[^{]*$/.test(rest) ? 'property' : /^\s*\(/.test(rest) ? 'function' : 'plain', found);
      i += found.length; continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(line);
    if (word) {
      const text = word[0], rest = line.slice(i + text.length);
      const lookup = spec.caseless ? text.toLowerCase() : text;
      let kind = 'plain';
      // An object key (`{ type: 1, b: 2 }`), but not a ternary branch or `::` path.
      if (language === 'c' && /^\s*:(?!:)/.test(rest) && ['', '{', ','].includes(previous)) kind = 'property';
      else if (CONSTANTS.has(text)) kind = 'constant';
      else if (spec.keywords.has(lookup)) kind = 'keyword';
      else if (/^\s*\(/.test(rest) || (language === 'c' && /^!\s*\(/.test(rest))) kind = 'function';
      else if (previous === '.') kind = 'property';
      else if (/^[A-Z][A-Z\d_]{2,}$/.test(text)) kind = 'constant';
      else if (/^[A-Z]/.test(text) && !spec.caseless) kind = 'type';
      else if (spec.keys && /^\s*[:=]/.test(rest)) kind = 'property';
      push(tokens, kind, text); i += text.length; previous = 'word'; continue;
    }
    const op = /[=<>!+\-*/%&|^~?:]+/y; op.lastIndex = i;
    const operator = op.exec(line);
    if (operator) { push(tokens, 'operator', operator[0]); i += operator[0].length; previous = operator[0]; continue; }
    push(tokens, 'punctuation', ch); i++; previous = ch;
  }
  return tokens;
}

/** The changed middle of a removed/added pair, as [start, end) on each side. */
export function changedRange(before, after) {
  if (before === after) return null;
  let start = 0;
  const limit = Math.min(before.length, after.length);
  while (start < limit && before[start] === after[start]) start++;
  let end = 0;
  while (end < limit - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  // Snap to word edges so the emphasis reads as whole tokens.
  while (start > 0 && /\w/.test(before[start - 1]) && /\w/.test(before[start] ?? '')) start--;
  while (end > 0 && /\w/.test(before[before.length - end]) && /\w/.test(before[before.length - end - 1] ?? '')) end--;
  const changedBefore = before.length - start - end, changedAfter = after.length - start - end;
  // A pair that shares almost nothing is a rewrite: emphasizing all of it adds noise.
  if (Math.max(changedBefore, changedAfter) > 0.7 * Math.max(before.length, after.length) && Math.max(before.length, after.length) > 12) return null;
  return { before: [start, before.length - end], after: [start, after.length - end] };
}

/** Splits tokens at an emphasis range: [{kind, text, emphasis}]. */
export function segments(tokens, range) {
  if (!range || range[0] >= range[1]) return tokens;
  const out = [];
  let at = 0;
  for (const token of tokens) {
    const start = at, end = at + token.text.length;
    at = end;
    const cuts = [start, Math.min(Math.max(range[0], start), end), Math.min(Math.max(range[1], start), end), end];
    for (let k = 0; k < 3; k++) {
      if (cuts[k + 1] > cuts[k]) out.push({ kind: token.kind, text: token.text.slice(cuts[k] - start, cuts[k + 1] - start), emphasis: k === 1 });
    }
  }
  return out;
}
