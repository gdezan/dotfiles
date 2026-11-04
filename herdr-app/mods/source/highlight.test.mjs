import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, languageFor, changedRange, segments } from './highlight.js';
import { diffRows } from './diff.js';

const kinds = tokens => tokens.filter(token => token.text.trim()).map(token => [token.kind, token.text.trim()]);

test('tokens always concatenate back to the line', () => {
  for (const [line, language] of [
    ['const x = foo("a\\"b", 42); // done', 'c'], ['if [ -n "$HOME" ]; then echo ${PATH} # hi', 'hash'],
    ['<div class="a">&amp; text</div>', 'markup'], ['  "key": [1, true, null],', 'json'], ['## Title with `code`', 'markdown'],
    ['  color: #fff; margin: 0 4px;', 'css'], ['SELECT id FROM users -- all', 'sql'], ['plain text', null],
  ]) assert.equal(tokenize(line, language).map(token => token.text).join(''), line, line);
});

test('C-like lines classify keywords, calls, strings, numbers and comments', () => {
  assert.deepEqual(kinds(tokenize('const x = foo("hi", 42); // done', 'c')), [
    ['keyword', 'const'], ['plain', 'x'], ['operator', '='], ['function', 'foo'], ['punctuation', '('], ['string', '"hi"'],
    ['punctuation', ','], ['number', '42'], ['punctuation', ');'], ['comment', '// done'],
  ]);
});

test('block comments carry across lines of one side', () => {
  const state = {};
  assert.deepEqual(kinds(tokenize('a /* start', 'c', state)), [['plain', 'a'], ['comment', '/* start']]);
  assert.deepEqual(kinds(tokenize('still */ b', 'c', state)), [['comment', 'still */'], ['plain', 'b']]);
});

test('object keys are properties, ternary branches are not', () => {
  assert.deepEqual(kinds(tokenize('{ type: 1, accent: x ? a : b }', 'c')).filter(([kind]) => kind === 'property'), [['property', 'type'], ['property', 'accent']]);
  assert.deepEqual(kinds(tokenize('  plain: 1,', 'c'))[0], ['property', 'plain']);
});

test('JSON keys differ from string values', () => {
  assert.deepEqual(kinds(tokenize('"name": "herdr"', 'json')), [['property', '"name"'], ['operator', ':'], ['string', '"herdr"']]);
});

test('languages follow file names', () => {
  assert.equal(languageFor('src/a.tsx'), 'c');
  assert.equal(languageFor('scripts\\deploy.sh'), 'hash');
  assert.equal(languageFor('Makefile'), 'hash');
  assert.equal(languageFor('notes.txt'), null);
});

test('paired lines emphasize only the changed word', () => {
  const range = changedRange('const width = 1000;', 'const width = 1200;');
  assert.deepEqual(range, { before: [14, 18], after: [14, 18] });
  assert.equal(changedRange('completely different', 'nothing alike at all here'), null);
  const parts = segments(tokenize('const width = 1200;', 'c'), range.after);
  assert.deepEqual(parts.filter(part => part.emphasis).map(part => part.text), ['1200']);
});

test('diffRows counts changes and keeps hunk context', () => {
  const rows = diffRows('@@ -1,2 +1,2 @@ function main() {\n-  let a = 1;\n+  let a = 2;\n same\n', 'c');
  assert.equal(rows.added, 1);
  assert.equal(rows.removed, 1);
  assert.equal(rows.unified[0].range, '@@ -1,2 +1,2 @@');
  assert.equal(rows.unified[0].context, 'function main() {');
  assert.deepEqual(rows.split[1].right.segments.filter(part => part.emphasis).map(part => part.text), ['2']);
});
