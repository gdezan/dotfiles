import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function element() {
  const node = { items: [] };
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === 'child') target.items.push(args[0]);
      else if (key === 'children') target.items.push(...args[0]);
      else if (key === 'when' && args[0]) args[1](proxy);
      else if (key === 'id') target.id = args[0];
      else if (key === 'tooltip') target.tooltip = args[0];
      return proxy;
    };
  } });
  return proxy;
}

function find(node, id) {
  if (!node || typeof node !== 'object') return null;
  if (node.id === id) return node;
  return node.items.map(child => find(child, id)).find(Boolean);
}

function text(node) {
  return typeof node === 'string' ? node : node?.items?.map(text).join(' ') ?? '';
}

test('agent titles follow the live folder in priority and grouped views without losing session or space context', async () => {
  const source = (await readFile(new URL('./main.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\n/gm, '').replace('export default class Agents', 'class Agents');
  const agent = { address: 't16', pane: 'p16', tab: 'tab', space: 'space', space_name: 'pi-agent-setup', status: 'working', app: 'pi' };
  const terminal = { address: 't16', state: 'live', cwd: 'C:\\Users\\gdezan\\Projetos\\pi-agent-setup', foreground: { cwd: 'C:\\Users\\gdezan\\Projetos\\skills' }, report: { app: 'pi', msg: 'format Markdown under 100 columns' } };
  const pane = { terminal: 't16', pane: 'p16', cwd: terminal.foreground.cwd };
  let sort = 'priority';
  const context = vm.createContext({
    View: class {}, div: element, svg: element, image: element, h_flex: element, v_flex: element,
    agents: () => [agent], terminals: () => [terminal], panes: () => [pane], focused: () => ({}),
    spaces: () => [{ tabs: [{ id: 'tab', name: '1' }] }], theme: () => ({}),
    shared: key => key === 'agents.sort' ? sort : null, setShared() {}, setAgentOrder() {},
    props: () => ({}), window: () => ({}), layout: () => ({ id: 'sidebar', size: { px: 268 } }),
    localStorage: { getItem: () => null, setItem() {} }, run() {}, openOverlay() {}, closeOverlay() {},
  });
  vm.runInContext(source + '\nthis.Agents = Agents;', context);
  const view = new context.Agents();
  const cx = { notify() {}, timer: { every() {} } };
  view.init({}, cx);
  for (sort of ['priority', 'grouped']) {
    const row = find(view.render(cx), 'ag-t16');
    assert.equal(text(row).trim().startsWith('skills'), true, `${sort} title uses live folder`);
    assert.match(text(row), /format Markdown under 100 columns/);
    assert.match(row.tooltip, /pi-agent-setup.*1/);
  }
  pane.cwd = '/home/gdezan/another-project/';
  assert.equal(text(find(view.render(cx), 'ag-t16')).trim().startsWith('another-project'), true);
  pane.cwd = null;
  assert.equal(text(find(view.render(cx), 'ag-t16')).trim().startsWith('skills'), true, 'foreground folder wins over original terminal folder');
  terminal.foreground = null;
  assert.equal(text(find(view.render(cx), 'ag-t16')).trim().startsWith('pi-agent-setup'), true);
});
