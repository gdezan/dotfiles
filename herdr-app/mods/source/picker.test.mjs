import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function element(id) {
  const node = { key: id, items: [], handlers: {} };
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === 'child') target.items.push(args[0]);
      else if (key === 'children') target.items.push(...args[0]);
      else if (key === 'when' && args[0]) args[1](proxy);
      else if (key === 'id') target.key = args[0];
      else if (key.startsWith('on_')) target.handlers[key] = args[0];
      return proxy;
    };
  } });
  return proxy;
}

function find(node, id) {
  if (!node || typeof node !== 'object') return null;
  if (node.key === id) return node;
  for (const child of node.items) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

test('selecting and deselecting a discovered child repository updates the tab', async () => {
  const repository = { key: '/parent/child', name: 'child', root: '/parent/child', on: null };
  const store = new Map();
  const cx = { notify() {} };
  const inputState = { new: () => ({ value: () => '', on() {}, release() {} }) };
  const mocks = {
    'gpui-kit': { div: () => element() },
    'gpui-base': { h_flex: () => element(), v_flex: () => element(), InputState: inputState, Checkbox: { new: id => element(id) }, v_virtual_list() {}, Scrollbar: {} },
    herdr: { settings() {}, pickFolder() {}, setShared: (key, value) => store.set(key, value), shared: key => store.get(key), focused() {}, closeOverlay() {} },
    './ui.js': {
      git: {}, selections: () => store.get('source.tabs') ?? {}, revision() {}, invalidate() {}, sourceTheme: () => ({}),
      button: () => element(), input: () => element(), message: () => element(),
      dialog: (_title, _subtitle, body, footer) => element().child(body).child(footer),
      openDiscard() {}, action() {}, closeSourceDiff() {}, showSourceTerminals() {},
    },
    './diff.js': { diffRows() {} },
  };
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(await readFile(new URL('./dialogs.js', import.meta.url), 'utf8'), { context });
  await module.link(name => {
    const exports = mocks[name];
    assert.ok(exports, `unexpected import ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const picker = new module.namespace.Picker();
  picker.props = { cwd: '/parent', name: 'tab', on: null, tabKey: 'tab' };
  picker.repositories = [repository];
  picker.selected = new Set();
  picker.search = inputState.new();

  const change = checked => {
    const checkbox = find(picker.render(), 'source-pick-/parent/child');
    assert.ok(checkbox, 'child repository appears in the picker');
    assert.equal(typeof checkbox.handlers.on_change, 'function', 'checkbox handles native change events');
    checkbox.handlers.on_change(checked, cx);
  };
  change(true);
  picker.apply();
  assert.equal(store.get('source.tabs').tab.repositories[0].key, repository.key);
  change(false);
  picker.apply();
  assert.equal(store.get('source.tabs').tab.repositories.length, 0);
});
