import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitSource } from './git.js';

const execute = promisify(execFile);
async function exec(command, args, options = {}) {
  try {
    const result = await execute(command, args, { cwd: options.cwd, maxBuffer: 8 * 1024 * 1024 });
    return { code: 0, ...result };
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}
const source = new GitSource(exec, path => readFile(path, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
}));
async function git(cwd, ...args) {
  const result = await exec('git', args, { cwd });
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'herdr-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function repository(name, initial = true) {
    const path = join(root, name);
    await mkdir(path);
    await git(path, 'init', '-b', 'main');
    await git(path, 'config', 'user.name', 'Source test');
    await git(path, 'config', 'user.email', 'source@example.invalid');
    await git(path, 'config', 'commit.gpgsign', 'false');
    if (initial) {
      await writeFile(join(path, 'payment.txt'), 'base\n');
      await git(path, 'add', '.');
      await git(path, 'commit', '-m', 'Initial');
    }
    return source.resolve(path);
  }
  return { root, repository };
}

test('discovers immediate repositories and worktrees under a non-Git parent, not deeper folders', async t => {
  const { root, repository } = await fixture(t);
  const merchant = await repository('merchant service');
  const portal = await repository('merchant-portal');
  await mkdir(join(root, 'not-a-repository'));
  await mkdir(join(root, 'nested'));
  await repository('nested/deeper');
  await git(merchant.root, 'worktree', 'add', '-b', 'review', join(root, 'merchant-worktree'));
  const found = await source.discover(root);
  assert.deepEqual(found.repositories.map(repo => repo.name).sort(), ['merchant service', 'merchant-portal', 'merchant-worktree']);
  assert.notEqual(found.repositories.find(repo => repo.name === 'merchant-worktree').key, merchant.key);
  assert.equal((await source.resolve(join(portal.root, '.git', '..'))).key, portal.key);
});

test('staged and unstaged diffs differ, and commit preserves unstaged edits and other repositories', async t => {
  const { repository } = await fixture(t);
  const merchant = await repository('merchant');
  const portal = await repository('portal');
  await writeFile(join(merchant.root, 'payment.txt'), 'base\nstaged idempotency\n');
  await source.stage(merchant, ['payment.txt']);
  await writeFile(join(merchant.root, 'payment.txt'), 'base\nstaged idempotency\nunstaged audit\n');
  await writeFile(join(portal.root, 'payment.txt'), 'portal staged\n');
  await source.stage(portal, ['payment.txt']);
  const state = await source.status(merchant);
  assert.deepEqual(state.staged.map(file => file.path), ['payment.txt']);
  assert.deepEqual(state.unstaged.map(file => file.path), ['payment.txt']);
  const staged = await source.diff(merchant, 'payment.txt', 'staged');
  const unstaged = await source.diff(merchant, 'payment.txt', 'unstaged');
  assert.match(staged.patch, /\+staged idempotency/);
  assert.doesNotMatch(staged.patch, /unstaged audit/);
  assert.match(unstaged.patch, /\+unstaged audit/);
  await source.commit(merchant, 'Add idempotency', state.index);
  assert.equal(await git(merchant.root, 'show', 'HEAD:payment.txt'), 'base\nstaged idempotency\n');
  assert.equal(await readFile(join(merchant.root, 'payment.txt'), 'utf8'), 'base\nstaged idempotency\nunstaged audit\n');
  assert.equal((await source.status(portal)).staged.length, 1);
  assert.equal((await source.status(merchant)).unstaged.length, 1);
});

test('commit refuses an empty index and detects staging changes since the displayed snapshot', async t => {
  const { repository } = await fixture(t);
  const repo = await repository('merchant');
  await writeFile(join(repo.root, 'payment.txt'), 'unstaged\n');
  await assert.rejects(source.commit(repo, 'Must not auto-stage'), /staged/i);
  await source.stage(repo, ['payment.txt']);
  const state = await source.status(repo);
  await writeFile(join(repo.root, 'another.txt'), 'another change\n');
  await source.stage(repo, ['another.txt']);
  await assert.rejects(source.commit(repo, 'Stale snapshot', state.index), /changed|refresh/i);
  assert.equal(await git(repo.root, 'log', '-1', '--format=%s'), 'Initial\n');
});

test('literal filenames, unborn unstage, added/deleted diffs, and staged-deletion recreation are safe', async t => {
  const { repository } = await fixture(t);
  const repo = await repository('unborn', false);
  const filename = ':(glob)* [review]\nfile.txt';
  await writeFile(join(repo.root, filename), 'first\n');
  await writeFile(join(repo.root, 'untouched.txt'), 'keep untracked\n');
  await source.stage(repo, [filename]);
  assert.deepEqual((await source.status(repo)).staged.map(file => file.path), [filename]);
  assert.match((await source.diff(repo, filename, 'staged')).patch, /\+first/);
  await writeFile(join(repo.root, filename), 'later\n');
  await source.unstage(repo, [filename]);
  assert.equal((await source.status(repo)).staged.length, 0);
  assert.equal(await readFile(join(repo.root, filename), 'utf8'), 'later\n');
  await source.stage(repo, [filename]);
  await source.commit(repo, 'First commit');
  await rm(join(repo.root, filename));
  assert.match((await source.diff(repo, filename, 'unstaged')).patch, /-later/);
  await source.stage(repo, [filename]);
  await writeFile(join(repo.root, filename), 'recreated\n');
  const state = await source.status(repo);
  assert.equal(state.staged.find(file => file.path === filename).status, 'D');
  assert.equal(state.unstaged.find(file => file.path === filename).status, '?');
  const confirmation = await source.discardSnapshot(repo, filename);
  await source.discard(repo, filename, confirmation);
  assert.equal((await source.status(repo)).staged.find(file => file.path === filename).status, 'D');
  assert.equal(await readFile(join(repo.root, 'untouched.txt'), 'utf8'), 'keep untracked\n');
});

test('discard restores the index, preserves staged changes, deletes only the confirmed untracked path, and rejects stale confirmation', async t => {
  const { repository } = await fixture(t);
  const repo = await repository('merchant');
  await writeFile(join(repo.root, 'payment.txt'), 'staged\n');
  await source.stage(repo, ['payment.txt']);
  await writeFile(join(repo.root, 'payment.txt'), 'unstaged\n');
  const snapshot = await source.discardSnapshot(repo, 'payment.txt');
  await writeFile(join(repo.root, 'payment.txt'), 'new agent edit\n');
  await assert.rejects(source.discard(repo, 'payment.txt', snapshot), /changed|review/i);
  assert.equal(await readFile(join(repo.root, 'payment.txt'), 'utf8'), 'new agent edit\n');
  await source.discard(repo, 'payment.txt', await source.discardSnapshot(repo, 'payment.txt'));
  assert.equal(await readFile(join(repo.root, 'payment.txt'), 'utf8'), 'staged\n');
  assert.equal((await source.status(repo)).staged.length, 1);
  for (const path of ['one[1].txt', 'one1.txt']) await writeFile(join(repo.root, path), 'keep\n');
  await source.discard(repo, 'one[1].txt', await source.discardSnapshot(repo, 'one[1].txt'));
  assert.equal(await readFile(join(repo.root, 'one1.txt'), 'utf8'), 'keep\n');
  await assert.rejects(readFile(join(repo.root, 'one[1].txt')), { code: 'ENOENT' });
});

test('remote actions use the current upstream without force, reject dirty pulls, and preserve rejected push state', async t => {
  const { root, repository } = await fixture(t);
  const repo = await repository('merchant');
  const remote = join(root, 'origin.git');
  await git(root, 'init', '--bare', remote);
  await git(repo.root, 'remote', 'add', 'origin', remote);
  await git(repo.root, 'push', '-u', 'origin', 'main');
  await writeFile(join(repo.root, 'payment.txt'), 'dirty\n');
  await assert.rejects(source.remote(repo, 'pull'), /local|commit|changes/i);
  await source.discard(repo, 'payment.txt', await source.discardSnapshot(repo, 'payment.txt'));
  const clone = join(root, 'other');
  await git(root, 'clone', '-b', 'main', remote, clone);
  await git(clone, 'config', 'user.name', 'Other');
  await git(clone, 'config', 'user.email', 'other@example.invalid');
  await git(clone, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(clone, 'incoming.txt'), 'incoming\n');
  await git(clone, 'add', '.');
  await git(clone, 'commit', '-m', 'Incoming');
  await git(clone, 'push');
  await source.remote(repo, 'fetch');
  assert.equal((await source.status(repo)).behind, 1);
  await assert.rejects(source.remote(repo, 'push'), /behind|pull|rejected/i);
  await source.remote(repo, 'pull');
  assert.equal((await source.status(repo)).behind, 0);
  assert.equal(await readFile(join(repo.root, 'incoming.txt'), 'utf8'), 'incoming\n');
  await writeFile(join(repo.root, 'payment.txt'), 'outgoing\n');
  await source.stage(repo, ['payment.txt']);
  await source.commit(repo, 'Outgoing');
  assert.equal((await source.status(repo)).ahead, 1);
  await source.remote(repo, 'push');
  assert.equal((await source.status(repo)).ahead, 0);
});
