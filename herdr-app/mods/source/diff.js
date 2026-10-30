export function diffRows(patch) {
  const unified = [];
  if (!patch) return { unified, split: [], limited: false, width: 0 };
  let old = 0, next = 0, inHunk = false;
  const lines = patch.replace(/\n$/, '').split('\n');
  for (const raw of lines) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    const text = raw.length > 4000 ? raw.slice(0, 4000) + '… (line truncated)' : raw;
    if (match) { old = Number(match[1]); next = Number(match[2]); inHunk = true; unified.push({ kind: 'hunk', text }); }
    else if (inHunk && raw.startsWith('-')) unified.push({ kind: 'removed', old: old++, text: text.slice(1) });
    else if (inHunk && raw.startsWith('+')) unified.push({ kind: 'added', next: next++, text: text.slice(1) });
    else if (inHunk && raw.startsWith(' ')) unified.push({ kind: 'same', old: old++, next: next++, text: text.slice(1) });
    else if (inHunk && raw.startsWith('\\')) unified.push({ kind: 'note', text });
    if (unified.length >= 3000) break;
  }
  const split = [];
  for (let cursor = 0; cursor < unified.length;) {
    const row = unified[cursor];
    if (row.kind === 'hunk' || row.kind === 'note') { split.push({ kind: row.kind, text: row.text }); cursor++; }
    else if (row.kind === 'same') { split.push({ left: { text: row.text, number: row.old }, right: { text: row.text, number: row.next } }); cursor++; }
    else {
      const removed = [], added = [];
      while (cursor < unified.length && ['removed', 'added'].includes(unified[cursor].kind)) {
        const row = unified[cursor++];
        if (row.kind === 'removed') removed.push({ text: row.text, number: row.old, kind: 'removed' });
        else added.push({ text: row.text, number: row.next, kind: 'added' });
      }
      for (let i = 0; i < Math.max(removed.length, added.length); i++) split.push({ left: removed[i], right: added[i] });
    }
  }
  return { unified, split, limited: unified.length >= 3000 || lines.some(line => line.length > 4000), width: Math.max(0, ...unified.map(row => row.text.length)) };
}
