import test from 'node:test';
import assert from 'node:assert/strict';
import { diffRows } from './diff.js';

test('a multi-hunk Git patch renders aligned split rows, line numbers, and unified changes', () => {
  const patch = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,4 @@\n context\n-old\n+new\n+extra\n tail\n@@ -10 +11 @@\n-before\n+after\n\\ No newline at end of file\n';
  const { unified, split, limited } = diffRows(patch);
  assert.equal(limited, false);
  assert.deepEqual(unified.map(row => [row.kind, row.old, row.next, row.text]), [
    ['hunk', undefined, undefined, '@@ -1,3 +1,4 @@'], ['same', 1, 1, 'context'],
    ['removed', 2, undefined, 'old'], ['added', undefined, 2, 'new'], ['added', undefined, 3, 'extra'],
    ['same', 3, 4, 'tail'], ['hunk', undefined, undefined, '@@ -10 +11 @@'],
    ['removed', 10, undefined, 'before'], ['added', undefined, 11, 'after'], ['note', undefined, undefined, '\\ No newline at end of file'],
  ]);
  assert.equal(split[2].left.text, 'old');
  assert.equal(split[2].right.text, 'new');
  assert.equal(split[3].left, undefined);
  assert.equal(split[3].right.text, 'extra');
  assert.equal(split[6].left.number, 10);
  assert.equal(split[6].right.number, 11);
});
