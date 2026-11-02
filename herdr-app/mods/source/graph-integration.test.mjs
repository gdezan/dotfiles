import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('graph reads the selected repository on its own machine', async () => {
  const calls = [], tasks = [], overlays = [];
  const cx = {
    focus_handle: () => ({}), notify() {},
    timer: { after() {}, every() {} },
    spawn(fn) { tasks.push(fn(cx)); },
  };
  const mocks = {
    'gpui-kit': { div() {}, svg() {}, PathBuilder: {} },
    'gpui-base': { v_flex() {}, h_flex() {}, Scrollbar: {}, v_virtual_list() {} },
    herdr: {
      props: () => ({ folder: '/remote/repo', on: 'vps', overlay: 'graph-overlay' }),
      spaces: () => [], panes: () => [], focused: () => ({}),
      exec: async (program, args, options) => {
        calls.push({ program, args, options });
        if (args.includes('--show-toplevel')) return { code: 0, stdout: '/remote/repo\n', stderr: '' };
        if (args.includes('HEAD')) return { code: 1, stdout: '', stderr: '' };
        return { code: 0, stdout: '', stderr: '' };
      },
      watchFolder() {}, readTextFile() {}, theme() {}, settings: () => ({}), shared() {}, setShared() {}, openOverlay: value => overlays.push(value), closeOverlay() {}, home() {},
    },
    './lanes.js': { layoutLanes: () => ({ rows: [], width: 0 }) },
    './git.js': { READ: [], STATUS: [], UNCOMMITTED: '*', LABEL: {}, logArgs: () => ['log'], parseLog: () => [], parseStatus: () => [], withUncommitted: () => [], labelsOf() {}, hitLabel() {}, menuFor: () => [], menuHeight: () => 50, fileArgs() {}, joinFiles() {}, diffArgs() {}, diffRows() {} },
    './act.js': { perform() {}, openDialog() {}, showChanges() {} },
    '../ui.js': { closeSourceGraph() {} },
    './menu.js': { icon() {} },
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(await readFile(new URL('./graph/graph.js', import.meta.url), 'utf8'), { context });
  await module.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
    for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
  }, { context }));
  await module.evaluate();
  const graph = new module.namespace.Graph();
  graph.init(cx);
  await Promise.all(tasks);
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.program === 'git' && call.options.cwd === '/remote/repo' && call.options.on === 'vps'));
  assert.equal(graph.ctx.graphOverlay, 'graph-overlay');
  graph.commits = [{ hash: 'commit', subject: 'subject', parents: [] }];
  graph.index = new Map([['commit', 0]]);
  graph.contextMenu('commit', { local_position: { x: 20 } }, cx);
  assert.equal(overlays[0].mod, 'source');
  assert.equal(overlays[0].props.view, 'graph-menu');
  assert.equal(overlays[0].props.ctx.graphOverlay, 'graph-overlay');
});

test('returning from graph to Source closes the graph overlay', async () => {
  const calls = [];
  const mocks = {
    herdr: { exec() {}, notify() {}, setShared() {}, openOverlay() {}, closeOverlay: id => calls.push(['close', id]), props: () => ({ overlay: 'graph-overlay' }), run: (name, args) => calls.push([name, args]) },
    '../ui.js': { invalidate() {}, closeSourceGraph: id => calls.push(['graph-close', id]) },
    './git.js': { dialogFor() {}, dialogHeight() {}, doneText() {} },
    './execute.js': { executeAction() {} },
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(await readFile(new URL('./graph/act.js', import.meta.url), 'utf8'), { context });
  await module.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
    for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
  }, { context }));
  await module.evaluate();
  module.namespace.showChanges('graph-overlay');
  assert.equal(calls[0][0], 'close');
  assert.equal(calls[0][1], 'graph-overlay');
  assert.equal(calls[1][0], 'layout.select');
  assert.equal(calls[1][1].child, 'source');
  assert.equal(calls[2][0], 'layout.show');
  calls.length = 0;
  module.namespace.showChanges(null, 'graph-target');
  assert.equal(calls[0][0], 'graph-close');
  assert.equal(calls[0][1], 'graph-target');
  assert.equal(calls[1][1].child, 'source');
});
