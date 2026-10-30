import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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

test('staged submodule pointers are visible, while discard cannot reset a submodule checkout', async t => {
  const root = await mkdtemp(join(tmpdir(), 'herdr-source-submodule-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (cwd, ...args) => { const result = await exec('git', args, { cwd }); assert.equal(result.code, 0, result.stderr); return result.stdout; };
  async function init(path) {
    await mkdir(path); await git(path, 'init', '-b', 'main');
    await git(path, 'config', 'user.name', 'Source'); await git(path, 'config', 'user.email', 'source@example.invalid');
    await git(path, 'config', 'commit.gpgsign', 'false');
  }
  const parent = join(root, 'parent'), child = join(root, 'child');
  await init(parent); await init(child);
  await writeFile(join(child, 'file.txt'), 'base');
  await git(child, 'add', '.'); await git(child, 'commit', '-m', 'Initial');
  await git(parent, '-c', 'protocol.file.allow=always', 'submodule', 'add', child, 'module');
  await git(parent, 'commit', '-m', 'Add module');
  const module = join(parent, 'module');
  await git(module, 'config', 'user.name', 'Source'); await git(module, 'config', 'user.email', 'source@example.invalid');
  await git(module, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(module, 'file.txt'), 'next'); await git(module, 'commit', '-am', 'Next');
  const source = new GitSource(exec);
  const repo = await source.resolve(parent);
  await assert.rejects(source.discardSnapshot(repo, 'module'), /submodule/i);
  await git(parent, 'add', 'module');
  assert.equal((await source.status(repo)).staged.some(file => file.path === 'module'), true);
});
