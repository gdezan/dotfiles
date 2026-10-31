import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function mainDiffHarness() {
  const context = vm.createContext({});
  let target = { id: 'first', space: 'space', tab: 'tab', repo: { key: 'repo' }, path: 'first.txt', group: 'staged' };
  let focus = { space: 'space', tab: 'tab' }, returned = 0;
  const element = { size_full() { return this; }, bg() { return this; } };
  const mocks = {
    'gpui-kit': { div: () => element },
    'gpui-base': { h_flex() {}, v_flex() {}, InputState: {}, Checkbox: {}, v_virtual_list() {}, Scrollbar: {} },
    herdr: { settings() {}, pickFolder() {}, setShared() {}, shared: () => target, focused: () => focus, closeOverlay() {} },
    './ui.js': {
      git: {}, selections() {}, revision() {}, invalidate() {}, sourceTheme: () => ({ background: '#000' }),
      button() {}, input() {}, message() {}, dialog() {}, openDiscard() {}, action() {}, closeSourceDiff() {},
      showSourceTerminals() { returned++; },
    },
    './diff.js': { diffRows() {} },
  };
  const module = new vm.SourceTextModule(await readFile(new URL('./dialogs.js', import.meta.url), 'utf8'), { context });
  await module.link(name => {
    const values = mocks[name];
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const { MainDiff, Diff } = module.namespace;
  Diff.prototype.init = function (props) { this.props = props; this.width = 1000; this.mode = 'split'; };
  Diff.prototype.render = function () { return this.props.path; };
  const main = new MainDiff(); main.init();
  return { main, setTarget(value) { target = value; }, setFocus(value) { focus = value; }, get returned() { return returned; } };
}

test('switching files preserves measured width and display mode', async () => {
  const h = await mainDiffHarness();
  assert.equal(h.main.render({}), 'first.txt');
  h.main.diff.width = 620; h.main.diff.mode = 'unified';
  h.setTarget({ id: 'second', space: 'space', tab: 'tab', repo: { key: 'repo' }, path: 'second.txt', group: 'unstaged' });
  assert.equal(h.main.render({}), 'second.txt');
  assert.equal(h.main.diff.width, 620);
  assert.equal(h.main.diff.mode, 'unified');
  assert.equal(h.main.diff.props.embedded, true);
});

test('a missing target or a different tab returns the main view to terminals', async () => {
  const h = await mainDiffHarness();
  assert.equal(h.main.render({}), 'first.txt');
  h.setFocus({ space: 'space', tab: 'other-tab' });
  h.main.render({});
  assert.equal(h.returned, 1);
  h.setTarget(null);
  h.main.render({});
  assert.equal(h.returned, 2);
});
