import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = fs.mkdtempSync('/tmp/pi-rename-latency-');
const server = http.createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const chunk of [
      { choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    ]) response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'test', ...chunk })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
fs.writeFileSync(`${root}/models.json`, JSON.stringify({ providers: { 'rename-test': {
  baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only',
  models: [{ id: 'test', reasoning: false, contextWindow: 32000, maxTokens: 100, compat: { supportsDeveloperRole: false } }],
} } }));
let address;
try {
  address = JSON.parse(execFileSync('hc', ['run', '--bg', '--no-parent', '--no-notify', '--cwd', root, '--', 'env', `PI_CODING_AGENT_DIR=${root}`, 'pi', '--provider', 'rename-test', '--model', 'test', '--session-dir', `${root}/sessions`, '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes'], { encoding: 'utf8' })).address;
  let requestedName, nameReportedAt;
  const terminal = () => {
    const info = JSON.parse(execFileSync('hc', ['get', address, '--json'], { encoding: 'utf8' }));
    if (requestedName && info.status?.msg === requestedName && nameReportedAt === undefined) nameReportedAt = performance.now();
    return info;
  };
  async function until(predicate) {
    const deadline = performance.now() + 15000;
    while (!predicate()) { assert.ok(performance.now() < deadline, 'condition did not become true'); await sleep(50); }
  }
  await until(() => terminal().status?.state === 'idle');
  const turn = exec('hc', ['exec', 'hc', 'send', address, 'Reply OK.']);
  await until(() => terminal().status?.state === 'done');
  await turn;
  const source = fs.readFileSync(new URL(process.argv[2] || './main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ').replace('export default class AgentSessionMenu', 'class AgentSessionMenu');
  const name = `latency-${Date.now()}`;
  requestedName = name;
  const properties = { terminal: `artemis/${address}`, name: '-', overlay: 'latency-test' };
  let closedAt, commandFinishedAt, pending;
  const start = performance.now();
  const context = vm.createContext({ View: class {}, props: () => properties,
    terminals: () => { const info = terminal(); return [{ ...info, address: properties.terminal, report: info.status, status: info.status?.state }]; },
    closeOverlay: () => { closedAt = performance.now(); }, notify: failure => { throw new Error(JSON.stringify(failure)); },
    exec: async (_program, args) => {
      const command = args.map(arg => /[\s"|&]/.test(arg) ? `"${arg.replaceAll('"', '`"')}"` : arg).join(' ');
      const result = await exec('ssh', ['iss', `hc ${command} | Out-String`]);
      commandFinishedAt = performance.now();
      return { code: 0, ...result };
    },
  });
  vm.runInContext(source + '\nthis.Menu = AgentSessionMenu;', context);
  const menu = new context.Menu(); menu.busy = false; menu.error = ''; menu.input = { value: () => name };
  const cx = { notify() {}, spawn: fn => { pending = fn(cx); }, timer: { every: (ms, callback) => {
    const id = setInterval(() => callback(cx), ms); return { cancel: () => clearInterval(id) };
  } } };
  menu.rename(cx);
  await until(() => terminal().status?.msg === name);
  const confirmedAt = nameReportedAt;
  await pending;
  const delay = closedAt - confirmedAt;
  console.log(JSON.stringify({ nameConfirmedMs: Math.round(confirmedAt - start), dialogClosedMs: Math.round(closedAt - start), commandFinishedMs: Math.round(commandFinishedAt - start), savingAfterSuccessMs: Math.round(delay) }));
  assert.ok(delay < 500, 'Saving must close within 500ms of Pi reporting its new name');
} finally {
  if (address) {
    execFileSync('hc', ['kill', address], { stdio: 'ignore' });
    execFileSync('hc', ['rm', address], { stdio: 'ignore' });
  }
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
