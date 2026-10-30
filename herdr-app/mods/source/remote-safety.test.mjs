import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitSource } from './git.js';

const execute = promisify(execFile);
const exec = async (command, args, options = {}) => {
  try { return { code: 0, ...await execute(command, args, { cwd: options.cwd }) }; }
  catch (error) { if (typeof error.code !== 'number') throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
};

test('Push targets only the displayed branch even when push.default is matching', async t => {
  const root = await mkdtemp(join(tmpdir(), 'herdr-source-push-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => { const result = await exec('git', args, { cwd: root }); assert.equal(result.code, 0, result.stderr); return result.stdout.trim(); };
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Source');
  await git('config', 'user.email', 'source@example.invalid');
  await git('config', 'commit.gpgsign', 'false');
  await writeFile(join(root, 'file.txt'), 'initial');
  await git('add', '.'); await git('commit', '-m', 'Initial');
  const remote = await mkdtemp(join(tmpdir(), 'herdr-source-origin-'));
  t.after(() => rm(remote, { recursive: true, force: true }));
  await git('init', '--bare', remote); await git('remote', 'add', 'origin', remote);
  await git('push', '-u', 'origin', 'main');
  await git('checkout', '-b', 'other'); await git('push', '-u', 'origin', 'other');
  const before = await git('rev-parse', 'origin/other');
  await writeFile(join(root, 'file.txt'), 'other change');
  await git('commit', '-am', 'Other branch'); await git('checkout', 'main');
  await writeFile(join(root, 'file.txt'), 'main change');
  await git('commit', '-am', 'Main branch');
  await git('config', 'push.default', 'matching');
  const source = new GitSource(exec);
  await source.remote(await source.resolve(root), 'push');
  assert.equal(await git('rev-parse', 'origin/other'), before);
  assert.equal(await git('rev-parse', 'origin/main'), await git('rev-parse', 'HEAD'));
});
