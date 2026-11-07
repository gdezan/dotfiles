import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import vm from 'node:vm';

const runFile = promisify(execFile);
const posixOnly = { skip: process.platform === 'win32' };
const report = { version: 1, rows: [] };
const reader = `console.log(${JSON.stringify(JSON.stringify(report))});\n`;

async function usageFixture(t, { installed = true, nodeOnPath = false } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'herdr-usage-node-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const bin = join(home, 'node bin');
  await mkdir(bin);
  await symlink(process.execPath, join(bin, 'node'));
  const shell = join(home, 'login-shell');
  await writeFile(shell, `#!/bin/sh\nexport PATH='${bin}':/usr/bin:/bin\nexec /bin/sh "$@"\n`, { mode: 0o700 });
  if (installed) {
    await mkdir(join(home, '.config/herdr-usage'), { recursive: true });
    await writeFile(join(home, '.config/herdr-usage/index.ts'), reader);
    await writeFile(join(home, '.config/herdr-usage/package.json'), '{"type":"module"}');
  }
  const calls = [];
  let machine = null;
  const exec = async (command, args, options) => {
    calls.push({ command, args, on: options?.on });
    try {
      const result = await runFile(command, args, {
        env: { ...process.env, HOME: home, SHELL: shell, PATH: nodeOnPath ? `${bin}:/usr/bin:/bin` : '/usr/bin:/bin' },
        timeout: 10000,
      });
      return { ...result, code: 0 };
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`'herdr.exec': cannot start ${command}: No such file or directory (os error 2)`);
      if (typeof error.code !== 'number') throw error;
      return { stdout: error.stdout, stderr: error.stderr, code: error.code };
    }
  };
  const source = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(source, { context });
  const mocks = {
    'gpui-kit': { View: class {}, div() {}, svg() {}, image() {} },
    'gpui-base': { v_flex() {}, h_flex() {} },
    herdr: {
      exec, appHome: () => home, layout() {}, theme() {},
      spaces: () => [{ active: true, machine }],
      readTextFile: async path => path.endsWith('/index.ts') ? reader : path.endsWith('/package.json') ? '{"type":"module"}' : '\n',
    },
  };
  await module.link(specifier => {
    const values = mocks[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const tasks = [];
  const cx = { timer: { every() {} }, notify() {}, spawn: task => tasks.push(task(cx)) };
  const view = new module.namespace.default();
  view.init({}, cx);
  const drain = async () => { while (tasks.length) await tasks.shift(); };
  return { home, view, calls, cx, drain, selectMachine: value => { machine = value; } };
}

test('Usage reads through shell-managed Node with no node in the app PATH, locally and remotely', posixOnly, async t => {
  const fixture = await usageFixture(t);
  for (const machine of [null, 'remote']) {
    fixture.selectMachine(machine);
    const start = fixture.calls.length;
    fixture.view.refresh(fixture.cx);
    await fixture.drain();
    assert.equal(fixture.view.state, 'ready', fixture.view.error);
    assert.ok(fixture.calls.slice(start).every(call => call.on === machine));
  }
  fixture.selectMachine(null);
  fixture.view.refresh(fixture.cx);
  await fixture.drain();
  assert.equal(fixture.view.state, 'ready', fixture.view.error);
  assert.equal(fixture.calls.filter(call => call.command === 'sh').length, 2);
});

test('Usage installs and then reads with shell-managed Node', posixOnly, async t => {
  const fixture = await usageFixture(t, { installed: false });
  fixture.view.refresh(fixture.cx);
  await fixture.drain();
  assert.equal(fixture.view.state, 'missing', fixture.view.error);
  fixture.view.install(fixture.cx);
  await fixture.drain();
  assert.equal(fixture.view.state, 'ready', fixture.view.error);
  assert.equal(await readFile(join(fixture.home, '.config/herdr-usage/index.ts'), 'utf8'), reader);
  assert.equal(fixture.calls.filter(call => call.command === 'sh').length, 1);
});

test('Usage preserves the original launch error when shell discovery fails', posixOnly, async t => {
  const fixture = await usageFixture(t);
  await rm(join(fixture.home, 'login-shell'));
  fixture.view.refresh(fixture.cx);
  await fixture.drain();
  assert.equal(fixture.view.state, 'error');
  assert.match(fixture.view.error, /cannot start node: No such file or directory/);
});

test('Usage does not retry a reader that starts but exits unsuccessfully', posixOnly, async t => {
  const fixture = await usageFixture(t, { nodeOnPath: true });
  await writeFile(join(fixture.home, '.config/herdr-usage/index.ts'), 'process.exit(1);');
  fixture.view.refresh(fixture.cx);
  await fixture.drain();
  assert.equal(fixture.view.state, 'error');
  assert.match(fixture.view.error, /Could not run the usage reader/);
  assert.equal(fixture.calls.length, 1);
});
