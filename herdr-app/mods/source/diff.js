import { tokenize, changedRange, segments } from './highlight.js';

export function diffRows(patch, language = null) {
  const unified = [];
  if (!patch) return { unified, split: [], limited: false, added: 0, removed: 0 };
  let old = 0, next = 0, inHunk = false, added = 0, removed = 0;
  // Each side carries its own tokenizer state (an open block comment, say).
  let oldState = {}, newState = {};
  const lines = patch.replace(/\n$/, '').split('\n');
  for (const raw of lines) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(raw);
    const expanded = raw.replace(/\r$/, '').replace(/\t/g, '    ');
    const text = expanded.length > 4000 ? expanded.slice(0, 4000) + '… (line truncated)' : expanded;
    if (match) {
      old = Number(match[1]); next = Number(match[2]); inHunk = true; oldState = {}; newState = {};
      unified.push({ kind: 'hunk', text, range: text.slice(0, text.length - match[3].length).trim(), context: match[3] });
    }
    else if (inHunk && raw.startsWith('-')) { removed++; unified.push({ kind: 'removed', old: old++, text: text.slice(1), tokens: tokenize(text.slice(1), language, oldState) }); }
    else if (inHunk && raw.startsWith('+')) { added++; unified.push({ kind: 'added', next: next++, text: text.slice(1), tokens: tokenize(text.slice(1), language, newState) }); }
    else if (inHunk && raw.startsWith(' ')) {
      tokenize(text.slice(1), language, oldState);
      unified.push({ kind: 'same', old: old++, next: next++, text: text.slice(1), tokens: tokenize(text.slice(1), language, newState) });
    }
    else if (inHunk && raw.startsWith('\\')) unified.push({ kind: 'note', text });
    if (unified.length >= 3000) break;
  }
  const split = [];
  for (let cursor = 0; cursor < unified.length;) {
    const row = unified[cursor];
    if (row.kind === 'hunk' || row.kind === 'note') { split.push(row); cursor++; }
    else if (row.kind === 'same') { split.push({ left: { text: row.text, number: row.old, tokens: row.tokens }, right: { text: row.text, number: row.next, tokens: row.tokens } }); cursor++; }
    else {
      const removedRows = [], addedRows = [];
      while (cursor < unified.length && ['removed', 'added'].includes(unified[cursor].kind)) {
        const row = unified[cursor++];
        if (row.kind === 'removed') removedRows.push(row);
        else addedRows.push(row);
      }
      // Pair the block line by line; a pair that mostly matches marks only what changed.
      for (let i = 0; i < Math.min(removedRows.length, addedRows.length); i++) {
        const range = changedRange(removedRows[i].text, addedRows[i].text);
        if (range) { removedRows[i].emphasis = range.before; addedRows[i].emphasis = range.after; }
      }
      for (const row of [...removedRows, ...addedRows]) row.segments = segments(row.tokens, row.emphasis);
      for (let i = 0; i < Math.max(removedRows.length, addedRows.length); i++) {
        const left = removedRows[i], right = addedRows[i];
        split.push({
          left: left && { text: left.text, number: left.old, kind: 'removed', tokens: left.tokens, segments: left.segments },
          right: right && { text: right.text, number: right.next, kind: 'added', tokens: right.tokens, segments: right.segments },
        });
      }
    }
  }
  return { unified, split, added, removed, limited: unified.length >= 3000 || lines.some(line => line.length > 4000) };
}

function sliceParts(parts, start, end) {
  const out = [];
  let at = 0;
  for (const part of parts) {
    const from = Math.max(start, at), to = Math.min(end, at + part.text.length);
    if (to > from) out.push({ ...part, text: part.text.slice(from - at, to - at) });
    at += part.text.length;
    if (at >= end) break;
  }
  return out;
}

// Visual lines of at most `columns` characters, breaking at a space when one is near the edge.
function chunks(line, columns) {
  const parts = line.segments ?? line.tokens ?? [{ kind: 'plain', text: line.text }];
  if (line.text.length <= columns) return [parts];
  const out = [];
  for (let start = 0; start < line.text.length;) {
    let end = Math.min(start + columns, line.text.length);
    if (end < line.text.length) {
      const space = line.text.lastIndexOf(' ', end);
      if (space > start + columns * 0.6) end = space + 1;
    }
    out.push(sliceParts(parts, start, end));
    start = end;
  }
  return out;
}

/** Rows that fit `columns` characters: long lines continue on rows without numbers. */
export function wrapRows(rows, mode, columns) {
  columns = Math.max(20, Math.floor(columns));
  const out = [];
  for (const row of rows) {
    if (row.kind === 'hunk' || row.kind === 'note') { out.push(row); continue; }
    if (mode === 'split') {
      const left = row.left && chunks(row.left, columns), right = row.right && chunks(row.right, columns);
      const count = Math.max(left?.length ?? 0, right?.length ?? 0, 1);
      const side = (line, parts, i) => line && { kind: line.kind, number: i === 0 ? line.number : undefined, segments: parts[i] ?? [], continuation: i > 0 };
      for (let i = 0; i < count; i++) out.push({ left: side(row.left, left, i), right: side(row.right, right, i) });
    } else {
      chunks(row, columns).forEach((parts, i) => out.push({ kind: row.kind, old: i === 0 ? row.old : undefined, next: i === 0 ? row.next : undefined, segments: parts, continuation: i > 0 }));
    }
  }
  return out;
}
