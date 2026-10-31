import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadOpen(spaces, panes) {
  const calls = [];
  const source = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(`${source}\nexport { open };`, { context });
  const mocks = {
    'gpui-kit': { View: class {}, div() {}, image() {}, svg() {} },
    'gpui-base': { h_flex() {}, v_flex() {}, Input() {}, InputState: { new() {} } },
    herdr: { appHome() {}, exec() {}, layout() {}, theme() {}, spaces: () => spaces, panes: () => panes, run: (...args) => calls.push(args) },
  };
  await module.link(specifier => {
    const values = mocks[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { open: module.namespace.open, calls };
}

test('opens in a local space whose pane has the original directory', async () => {
  const { open, calls } = await loadOpen([{ id: 'remote', machine: 'vps', folder: '/project', tabs: [] }, { id: 'local', machine: null, folder: '/other', tabs: [{ id: 't1' }] }], [{ tab: 't1', cwd: '/project' }]);
  open({ cwd: '/project', argv: ['pi', '--session', '/history/a.jsonl'] });
  assert.equal(calls[0][0], 'space.select');
  assert.equal(calls[0][1].id, 'local');
  assert.equal(calls[1][0], 'tab.new');
  assert.equal(calls[1][1].space, 'local');
  assert.equal(calls[1][1].folder, '/project');
});

test('creates a space in the session directory when no local match exists', async () => {
  const { open, calls } = await loadOpen([], []);
  open({ cwd: '/project', argv: ['claude', '--resume', 'session-id'] });
  assert.equal(calls[0][0], 'space.new');
  assert.equal(calls[0][1].folder, '/project');
  assert.equal(calls[0][1].argv[2], 'session-id');
});
