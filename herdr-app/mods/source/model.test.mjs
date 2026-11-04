import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function harness() {
  const store = new Map(), pending = new Set(), modules = new Map(), calls = [], overlays = [];
  let currentLayout = { id: 'main-view', type: 'stack', active: 'main', children: [{ id: 'main' }, { id: 'source-diff-main', content: { mod: 'source' } }] };
  const first = { key: 'first', name: 'First', root: '/merchant', gitDir: '/merchant/.git', on: null };
  const second = { key: 'second', name: 'Second', root: '/portal', gitDir: '/portal/.git', on: null };
  let focus = { space: 's1', tab: 'tb1', pane: 'p1', cwd: '/parent' };
  const spaces = [{ id: 's1', name: 'Project', active: true, machine: null, folder: '/parent', tabs: [{ id: 'tb1', name: 'First', active: true }, { id: 'tb2', name: 'Second' }] }];
  const context = vm.createContext({ console });
  const input = { new({ value = '' } = {}) { return { text: value, events: {}, value() { return this.text; }, set_value(value) { this.text = value; }, on(name, fn) { this.events[name] = fn; }, release() {} }; } };
  const mocks = {
    'gpui-kit': { div() {}, svg() {} },
    'gpui-base': { Button: {}, Input: {}, InputState: input, h_flex() {}, v_flex() {} },
    herdr: {
      exec() {}, readTextFile() {}, window: () => ({ platform: 'macos' }), theme() {},
      focused: () => focus, spaces: () => spaces, panes: () => [{ pane: 'p1', tab: 'tb1', cwd: focus.tab === 'tb1' ? focus.cwd : '/parent' }, { pane: 'p2', tab: 'tb2', cwd: '/portal' }],
      shared: key => store.get(key), setShared: (key, value) => store.set(key, value),
      layout: () => currentLayout, run(name, args) { calls.push([name, args]); if (name === 'layout.select') currentLayout.active = args.child; },
      openOverlay(spec) { overlays.push(spec); }, closeOverlay() {}, notify() {}, watchFolder: () => new Promise(() => {}),
    },
  };
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    let module;
    if (mocks[name]) {
      const values = mocks[name];
      module = new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
    } else {
      const source = await readFile(new URL(name, import.meta.url), 'utf8');
      module = new vm.SourceTextModule(source, { context });
    }
    modules.set(name, module);
    await module.link(load);
    return module;
  }
  const panelModule = await load('./panel.js');
  await panelModule.evaluate();
  const ui = modules.get('./ui.js').namespace;
  const state = { files: [], staged: [], unstaged: [], conflicts: [], index: 'index-1', branch: 'main' };
  ui.git.resolve = async path => path === '/portal' ? second : first;
  ui.git.status = async () => state;
  const cx = { notify() {}, timer: { every() {} }, spawn(fn) { const task = fn(cx); pending.add(task); task.finally(() => pending.delete(task)); } };
  async function settle() {
    for (let i = 0; i < 15 && pending.size; i++) {
      const tasks = [...pending];
      await Promise.all(tasks.filter(task => !task.watcher));
    }
  }
  const Panel = panelModule.namespace.default;
  const panel = new Panel();
  // Watchers are deliberately not started; these checks exercise tab and mutation ownership.
  panel.watch = () => {};
  return { panel, cx, store, first, second, state, spaces, git: ui.git, ui, calls, overlays, settle, setFocus(value) { focus = value; }, setLayout(value) { currentLayout = value; }, key: () => JSON.stringify([null, 's1']) };
}

test('a space shares its pinned selection across tabs, including explicit empty selection', async () => {
  const h = await harness();
  h.panel.init({}, h.cx); await h.settle();
  assert.equal(h.panel.selected()[0].key, h.first.key);
  h.store.set('source.spaces', { ...h.store.get('source.spaces'), [h.key('tb1')]: { cwd: '/parent', on: null, repositories: [], explicit: true } });
  h.panel.refresh(h.cx); await h.settle();
  assert.equal(h.panel.selected().length, 0);
  h.setFocus({ space: 's1', tab: 'tb2', pane: 'p2', cwd: '/portal' });
  h.panel.refresh(h.cx); await h.settle();
  assert.equal(h.panel.selected().length, 0);
  h.setFocus({ space: 's1', tab: 'tb1', pane: 'p1', cwd: '/portal' });
  h.panel.refresh(h.cx); await h.settle();
  assert.equal(h.panel.selected().length, 0);
  assert.equal(h.store.get('source.spaces')[h.key('tb1')].cwd, '/parent');
});

test('empty automatic discovery retries when the terminal folder changes', async () => {
  const h = await harness(), resolved = [];
  h.git.resolve = async cwd => {
    resolved.push(cwd);
    if (cwd === '/parent') throw new Error('not a git repository');
    return h.second;
  };
  h.panel.init({}, h.cx); await h.settle();
  h.panel.refresh(h.cx); await h.settle();
  assert.deepEqual(resolved, ['/parent']);
  h.setFocus({ space: 's1', tab: 'tb1', pane: 'p1', cwd: '/portal' });
  h.panel.refresh(h.cx); await h.settle();
  assert.deepEqual(resolved, ['/parent', '/portal']);
  assert.equal(h.panel.selected()[0].key, h.second.key);
  h.setFocus({ space: 's1', tab: 'tb1', pane: 'p1', cwd: '/elsewhere' });
  h.panel.refresh(h.cx); await h.settle();
  assert.deepEqual(resolved, ['/parent', '/portal']);
});

test('first discovery prefers the space project over a different focused terminal folder', async () => {
  const h = await harness();
  h.spaces[0].name = 'portal';
  h.panel.init({}, h.cx); await h.settle();
  assert.equal(h.panel.selected()[0].key, h.second.key);
});

test('different spaces keep independent repository pins', async () => {
  const h = await harness();
  h.panel.init({}, h.cx); await h.settle();
  h.spaces.push({ id: 's2', name: 'Other', machine: null, folder: '/portal', tabs: [{ id: 'tb3', active: true }] });
  h.setFocus({ space: 's2', tab: 'tb3', cwd: '/portal' });
  h.panel.refresh(h.cx); await h.settle();
  assert.equal(h.panel.selected()[0].key, h.second.key);
  h.setFocus({ space: 's1', tab: 'tb1', pane: 'p1', cwd: '/parent' });
  assert.equal(h.panel.selected()[0].key, h.first.key);
});

test('re-detection replaces the space pin using the focused terminal', async () => {
  const h = await harness();
  h.panel.init({}, h.cx); await h.settle();
  h.setFocus({ space: 's1', tab: 'tb2', pane: 'p2', cwd: '/portal' });
  h.panel.redetect(h.cx); await h.settle();
  assert.equal(h.panel.selected()[0].key, h.second.key);
  h.setFocus({ space: 's1', tab: 'tb1', pane: 'p1', cwd: '/parent' });
  assert.equal(h.panel.selected()[0].key, h.second.key);
});

test('interrupted initialization resumes from the pinned discovery folder rather than a later cwd', async () => {
  const h = await harness();
  h.store.set('source.spaces', { [h.key('tb1')]: { cwd: '/parent', on: null, initializing: true, repositories: [] } });
  const resolved = [];
  h.git.resolve = async cwd => { resolved.push(cwd); return h.first; };
  h.setFocus({ space: 's1', tab: 'tb1', pane: 'p1', cwd: '/portal' });
  h.panel.init({}, h.cx); await h.settle();
  assert.deepEqual(resolved, ['/parent']);
  assert.equal(h.store.get('source.spaces')[h.key('tb1')].initializing, false);
});

test('an in-flight commit stays on its captured checkout after tab/cwd changes and preserves a newer draft', async () => {
  const h = await harness();
  h.panel.init({}, h.cx); await h.settle();
  const entry = h.panel.entries.get(h.first.key);
  entry.data = { ...h.state, staged: [{ path: 'payment.txt' }] };
  entry.input.set_value('Original draft');
  let finish;
  const calls = [];
  h.git.commit = async (repo, message, index) => { calls.push([repo.key, message, index]); await new Promise(resolve => { finish = resolve; }); };
  h.panel.commit(entry, h.cx);
  h.setFocus({ space: 's1', tab: 'tb2', pane: 'p2', cwd: '/portal' });
  entry.input.set_value('New draft typed during the commit');
  finish(); await h.settle();
  assert.deepEqual(calls, [[h.first.key, 'Original draft', 'index-1']]);
  assert.equal(entry.input.value(), 'New draft typed during the commit');
  assert.equal(entry.busy, null);
});

test('opens history for the selected repository, not the focused terminal folder', async () => {
  const h = await harness();
  h.ui.openGraph({ ...h.second, on: 'vps' });
  const graph = h.store.get('source.graph');
  assert.equal(graph.repo.root, '/portal');
  assert.equal(graph.repo.on, 'vps');
  assert.equal(graph.tab, 'tb1');
  assert.equal(h.calls[0][0], 'layout.select');
  assert.equal(h.calls[0][1].child, 'source-diff-main');
  assert.equal(h.overlays.length, 0);
  h.ui.closeSourceGraph(graph.id);
  assert.equal(h.store.get('source.graph'), null);
  assert.equal(h.calls[1][1].child, 'main');
});

test('diff colors use the gdezan-material editor and Git palette', async () => {
  const h = await harness(), colors = h.ui.sourceTheme();
  assert.equal(colors.foreground, '#C7D6D6');
  assert.equal(colors.git_added, '#00C8FF');
  assert.equal(colors.git_deleted, '#FF0000');
  assert.equal(colors.diff_added_background, '#00C8FF12');
  assert.equal(colors.diff_removed_background, '#FF000012');
});

test('opening and closing a diff switches the main stack without changing terminal panes', async () => {
  const h = await harness();
  h.ui.openDiff(h.first, { path: 'src/payment.ts' }, 'unstaged');
  const target = h.store.get('source.diff');
  assert.equal(target.tab, 'tb1');
  assert.equal(target.path, 'src/payment.ts');
  assert.equal(target.group, 'unstaged');
  assert.equal(h.calls[0][0], 'layout.select');
  assert.equal(h.calls[0][1].child, 'source-diff-main');
  assert.equal(h.overlays.length, 0);
  h.ui.closeSourceDiff(target.id);
  assert.equal(h.store.get('source.diff'), null);
  assert.equal(h.calls[1][1].child, 'main');
});

test('T3 opens and closes diffs in its view stack', async () => {
  const h = await harness();
  h.setLayout({ id: 'view', type: 'stack', active: 'agent', children: [{ id: 'main' }, { id: 'agent' }, { id: 'source-diff-main', content: { mod: 'source' } }] });
  h.ui.openDiff(h.first, { path: 'example.txt' }, 'unstaged');
  assert.equal(h.overlays.length, 0);
  assert.equal(h.calls[0][1].stack, 'view');
  assert.equal(h.calls[0][1].child, 'source-diff-main');
  assert.equal(h.ui.currentSourceDiff().path, 'example.txt');
  h.ui.closeSourceDiff();
  assert.equal(h.calls[1][1].stack, 'view');
  assert.equal(h.calls[1][1].child, 'main');
});

test('a stale diff action cannot close a newer selection', async () => {
  const h = await harness();
  h.ui.openDiff(h.first, { path: 'old.txt' }, 'unstaged');
  const old = h.store.get('source.diff');
  h.ui.openDiff(h.second, { path: 'new.txt' }, 'staged');
  const current = h.store.get('source.diff');
  h.ui.closeSourceDiff(old.id);
  assert.equal(h.store.get('source.diff'), current);
  assert.equal(h.calls.length, 2);
  h.ui.closeSourceDiff(current.id);
  assert.equal(h.calls[2][1].child, 'main');
});

test('other layouts retain the diff dialog', async () => {
  const h = await harness();
  h.setLayout({ id: 'root', type: 'block' });
  h.ui.openDiff(h.first, { path: 'example.txt' }, 'staged');
  assert.equal(h.calls.length, 0);
  assert.equal(h.overlays[0].props.view, 'diff');
  assert.equal(h.overlays[0].props.path, 'example.txt');
});
