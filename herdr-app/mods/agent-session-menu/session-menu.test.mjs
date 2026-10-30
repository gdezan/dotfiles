import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ').replace('export default class AgentSessionMenu', 'class AgentSessionMenu');
let terminal, p, calls, pending, keyHandler, execResult, timers;
function element() {
  const proxy = new Proxy({}, { get: (_target, key) => (...args) => {
    if (key === 'on_key_down') keyHandler = args[0];
    return proxy;
  } });
  return proxy;
}
const context = vm.createContext({ View: class {}, div: element, svg: element, v_flex: element, h_flex: element, theme: () => ({}),
  terminals: () => terminal ? [terminal] : [], agents: () => [], props: () => p,
  closeOverlay: id => calls.push(['close', id]), openOverlay: spec => calls.push(['open', spec]),
  run: (...args) => calls.push(['run', ...args]), notify: spec => calls.push(['notify', spec]),
  exec: async (...args) => { calls.push(['exec', ...args]); return execResult ?? { code: 0 }; },
});
vm.runInContext(source + '\nthis.Menu = AgentSessionMenu; this.items = sessionMenuItems;', context);
const cx = { notify() {}, write_to_clipboard: text => calls.push(['clipboard', text]), spawn: fn => { pending = fn(cx); },
  timer: { every: (_ms, callback) => { const timer = { callback, cancelled: false, cancel() { this.cancelled = true; } }; timers.push(timer); return timer; } } };
function setup(status = 'idle') {
  terminal = { address: 'remote/t9', state: 'live', status, report: { app: 'pi' } };
  p = { terminal: 'remote/t9', name: 'Actual session name', overlay: 'menu-1' };
  calls = []; pending = null; execResult = null; timers = [];
  const menu = new context.Menu(); menu.busy = false; menu.error = ''; return menu;
}
let menu = setup();
menu.choose(2, cx);
assert.equal(calls.find(c => c[0] === 'clipboard')[1], 'remote/t9');
menu = setup(); menu.choose(5, cx);
assert.equal(calls.find(c => c[0] === 'open')[1].props.command.args.terminal, 'remote/t9');
assert.equal(calls.some(c => c[0] === 'run' || c[0] === 'exec'), false, 'stop must only open confirmation');
menu = setup(); menu.input = { value: () => 'New session name' }; menu.rename(cx); await pending;
assert.deepEqual(Array.from(calls.find(c => c[0] === 'exec')[2]), ['exec', '--on', 'remote', 'hc', 'send', 't9', '/name New session name']);
menu = setup(); terminal.report.app = 'claude-code'; menu.input = { value: () => 'New name' }; menu.rename(cx); await pending;
assert.equal(calls.find(c => c[0] === 'exec')[2][6], '/rename New name');
menu = setup('working');
assert.equal(context.items(terminal, p.name).find(i => i.id === 'rename').enabled, true, 'working named sessions must be renameable');
menu.input = { value: () => 'Replacement name' }; menu.rename(cx); await pending;
assert.deepEqual(Array.from(calls.find(c => c[0] === 'exec')[2]), ['exec', '--on', 'remote', 'hc', 'send', 't9', '/name Replacement name']);
assert.equal(calls.filter(c => c[0] === 'exec').length, 1, 'rename must not interrupt work');
menu = setup(); terminal.address = 't9'; p.terminal = 't9';
menu.input = { value: () => 'Local + café 🚀' }; menu.rename(cx); await pending;
assert.deepEqual(Array.from(calls.find(c => c[0] === 'exec')[2]), ['exec', 'hc', 'send', 't9', '/name Local + café 🚀']);
menu = setup('done');
assert.equal(context.items(terminal, p.name).find(i => i.id === 'rename').enabled, true, 'completed named sessions must be renameable');
menu = setup('blocked'); menu.input = { value: () => 'New name' }; menu.rename(cx);
assert.equal(calls.length, 0, 'rename must not answer a blocked permission dialog');
menu = setup(); menu.input = { value: () => 'Name\n/quit' }; menu.rename(cx);
assert.equal(calls.length, 0, 'multiline rename must not send');
menu = setup('working'); menu.choose(4, cx); await pending;
assert.deepEqual(Array.from(calls.find(c => c[0] === 'exec')[2]), ['interrupt', 'remote/t9']);
menu = setup(); terminal = undefined; menu.choose(5, cx);
assert.equal(calls.length, 0, 'ended terminal must not open stop');
menu = setup(); terminal.report.app = 'unknown-agent';
assert.equal(context.items(terminal, p.name).find(i => i.id === 'rename').enabled, false);
menu = setup(); terminal = undefined; p.name = '-'; menu.at = 0; menu.render(cx);
context.handleKey = keyHandler; context.cx = { ...cx, stop_propagation() {} };
vm.runInContext('handleKey({ key: "down" }, cx)', context, { timeout: 100 });
assert.equal(menu.at, 0, 'no enabled actions must not loop forever');
menu = setup('done');
let finish;
execResult = new Promise(resolve => { finish = resolve; });
menu.input = { value: () => 'Confirmed name' }; menu.rename(cx);
terminal.report.msg = 'Another name';
for (const timer of timers) timer.callback(cx);
assert.equal(calls.some(c => c[0] === 'close'), false, 'unrelated report must not count as success');
terminal.report.msg = 'Confirmed name';
for (const timer of timers) timer.callback(cx);
assert.equal(calls.filter(c => c[0] === 'close').length, 1, 'Pi confirmation must close Saving before hc finishes');
finish({ code: 1, stderr: 'late transport failure' }); await pending;
assert.equal(calls.some(c => c[0] === 'notify'), false, 'confirmed success must not become a late failure');
assert.equal(timers.every(timer => timer.cancelled), true, 'confirmation timer must stop after success');
menu = setup('done'); execResult = { code: 1, stderr: 'connection refused' };
menu.input = { value: () => 'Failed name' }; menu.rename(cx); await pending;
assert.equal(calls.some(c => c[0] === 'close'), false, 'failed rename must leave the form open');
assert.equal(menu.busy, false);
assert.match(menu.error, /connection refused/);
assert.equal(timers.every(timer => timer.cancelled), true, 'confirmation timer must stop after failure');
console.log('Session menu safety checks passed (15 cases)');
