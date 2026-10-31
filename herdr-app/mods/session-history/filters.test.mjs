import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadFilters() {
  const calls = [];
  const source = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(`${source}\nexport { matchesFolder, matchesSearch, folderCounts, folderLabels };`, { context });
  const mocks = {
    'gpui-kit': { View: class {}, div() {}, image() {}, svg() {} },
    'gpui-base': { h_flex() {}, v_flex() {}, Input() {}, InputState: { new() {} } },
    herdr: { appHome() {}, exec() {}, layout() {}, theme() {}, spaces: () => [], panes: () => [], run: (...args) => calls.push(args) },
  };
  await module.link(specifier => {
    const values = mocks[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

const session = (title, cwd, agent = 'pi') => ({ title, cwd, agent });

test('search matches a title or a folder, never the agent name', async () => {
  const { matchesSearch } = await loadFilters();
  const row = session('fix the login redirect', '/home/me/Dev/scoutr', 'claude');
  assert.equal(matchesSearch(row, 'login'), true);
  assert.equal(matchesSearch(row, 'SCOUTR'), true);
  assert.equal(matchesSearch(row, 'claude'), false);
  assert.equal(matchesSearch(row, ''), true);
});

test('a folder filter is the whole path, and no folder means every session', async () => {
  const { matchesFolder } = await loadFilters();
  const row = session('a', '/home/me/Dev/pi-agent-setup');
  assert.equal(matchesFolder(row, null), true);
  assert.equal(matchesFolder(row, '/home/me/Dev/pi-agent-setup'), true);
  assert.equal(matchesFolder(row, '/home/me/Projects/pi-agent-setup'), false);
  assert.equal(matchesFolder(session('b', null), null), true);
});

test('folder rows count what the search leaves, keep the picked folder, and lead with the busiest', async () => {
  const { folderCounts } = await loadFilters();
  const rows = [session('login', '/a/alpha'), session('login twice', '/b/beta'), session('logout', '/b/beta'), session('other', '/c/gamma')];
  // Rows come from the module's own realm, so their arrays never deep-equal ours.
  const rowsOf = (query, folder) => folderCounts(rows, query, folder).map(r => `${r.label}:${r.count}`).join(' ');
  assert.equal(rowsOf('', null), 'beta:2 alpha:1 gamma:1');
  assert.equal(rowsOf('log', null), 'beta:2 alpha:1');
  assert.equal(rowsOf('log', '/c/gamma'), 'beta:2 alpha:1 gamma:0');
});

test('two folders with one name show their parent instead', async () => {
  const { folderLabels } = await loadFilters();
  const labels = folderLabels(new Set(['/home/me/Dev/bridge', '/home/me/Dev/scoutr/bridge', '/home/me/Dev/unique', '']));
  assert.equal(labels.get('/home/me/Dev/bridge'), 'Dev/bridge');
  assert.equal(labels.get('/home/me/Dev/scoutr/bridge'), 'scoutr/bridge');
  assert.equal(labels.get('/home/me/Dev/unique'), 'unique');
  assert.equal(labels.get(''), 'Folder unavailable');
});
