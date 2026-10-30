// Read-only refreshes must not write index locks and retrigger the folder watcher.
const READ = ['--no-optional-locks', '-c', 'diff.autoRefreshIndex=false'];
const BASE = ['--literal-pathspecs', '-c', 'core.fsmonitor=false'];
export const FILE_LIMIT = 1000;
export const repoKey = (root, on = null) => JSON.stringify([on, root]);

function parseStatus(text) {
  const records = text.split('\0').filter(Boolean);
  const header = records[0]?.startsWith('## ') ? records.shift().slice(3) : '';
  const files = new Map();
  for (const record of records) {
    const xy = record.slice(0, 2), path = record.slice(3);
    const file = files.get(path) ?? { path, x: ' ', y: ' ', untracked: false, conflict: false };
    if (xy === '??') { file.untracked = true; file.y = '?'; }
    else {
      file.x = xy[0];
      if (!file.untracked) file.y = xy[1];
      file.conflict = xy.includes('U') || xy === 'AA' || xy === 'DD';
    }
    files.set(path, file);
  }
  return { header, files: [...files.values()] };
}

export class GitSource {
  constructor(exec, readTextFile, platform = 'unix') {
    this.exec = exec;
    this.readTextFile = readTextFile;
    this.platform = platform;
    this.pending = new Set();
    this.initializing = new Set();
  }

  async command(repo, args, read = true, allowed = [0]) {
    const result = await this.exec('git', [...BASE, ...(read ? READ : []), ...args], { cwd: repo.root, on: repo.on });
    if (!allowed.includes(result.code)) throw new Error((result.stderr || result.stdout || `Git exited with code ${result.code}`).trim());
    return result;
  }

  async resolve(path, on = null) {
    const repo = { root: path, on };
    const result = await this.command(repo, ['rev-parse', '--show-toplevel']);
    const root = result.stdout.replace(/\r?\n$/, '');
    const dir = await this.command({ root, on }, ['rev-parse', '--absolute-git-dir']);
    return { root, on, gitDir: dir.stdout.replace(/\r?\n$/, ''), name: root.split(/[\\/]/).pop(), key: repoKey(root, on) };
  }

  async discover(cwd, on = null) {
    const found = new Map(), errors = [];
    try { const repo = await this.resolve(cwd, on); found.set(repo.key, repo); }
    catch (error) { if (!/not a git repository/i.test(String(error))) errors.push(String(error)); }
    let paths;
    if (!on && this.platform === 'windows') {
      const result = await this.exec('powershell', ['-NoProfile', '-Command', '& { param($p) @(Get-ChildItem -LiteralPath $p -Directory -Force -ErrorAction Stop | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName .git) } | Select-Object -First 501 -ExpandProperty FullName) | ConvertTo-Json -Compress }', cwd]);
      if (result.code !== 0) throw new Error(result.stderr || 'Cannot scan this folder');
      const parsed = JSON.parse(result.stdout || '[]'); paths = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      const script = 'test -d "$1" || exit 1; n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -d "$p" ] && [ -e "$p/.git" ] || continue; printf "%s\\0" "$p"; n=$((n+1)); [ "$n" -ge 501 ] && break; done; exit 0';
      const result = await this.exec('sh', ['-c', script, 'source', cwd], { on });
      if (result.code !== 0) throw new Error(result.stderr || 'Cannot scan this folder');
      paths = result.stdout.split('\0').filter(Boolean);
    }
    for (const path of paths.slice(0, 500)) {
      try { const repo = await this.resolve(path, on); found.set(repo.key, repo); }
      catch (error) { errors.push(`${path}: ${error}`); }
    }
    return { repositories: [...found.values()].sort((a, b) => a.name.localeCompare(b.name)), limited: paths.length > 500, errors };
  }

  async status(repo) {
    const status = await this.command(repo, ['status', '--porcelain=v1', '--branch', '-z', '--no-renames', '--untracked-files=all', '--ignore-submodules=dirty']);
    const { header, files } = parseStatus(status.stdout);
    const head = await this.command(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'], true, [0, 1]);
    const index = await this.command(repo, ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames', '--no-ext-diff', '--no-textconv', '--ignore-submodules=dirty']);
    const unborn = head.code === 1;
    const branch = unborn ? header.replace(/^(No commits yet on|Initial commit on) /, '') : header.startsWith('HEAD ') ? `Detached ${head.stdout.trim().slice(0, 7)}` : header.split('...')[0];
    const upstream = header.includes('...') ? header.split('...')[1].split(' ')[0] : null;
    return {
      files, branch, upstream, head: unborn ? null : head.stdout.trim(),
      index: JSON.stringify([head.stdout.trim(), index.stdout]),
      ahead: Number(/ahead (\d+)/.exec(header)?.[1] ?? 0), behind: Number(/behind (\d+)/.exec(header)?.[1] ?? 0),
      conflicts: files.filter(file => file.conflict),
      staged: files.filter(file => !file.conflict && file.x !== ' ').map(file => ({ ...file, status: file.x })),
      unstaged: files.filter(file => !file.conflict && file.y !== ' ').map(file => ({ ...file, status: file.y })),
      limited: files.length > FILE_LIMIT,
    };
  }

  async exclusive(repo, action) {
    if (this.pending.has(repo.key)) throw new Error('Another Git operation is still running for this repository.');
    this.pending.add(repo.key);
    try { return await action(); }
    finally { this.pending.delete(repo.key); }
  }

  async stage(repo, paths) {
    return this.exclusive(repo, async () => {
      const state = await this.status(repo);
      this.validatePaths(state.unstaged, paths);
      await this.command(repo, ['add', '--', ...paths], false);
    });
  }

  async unstage(repo, paths) {
    return this.exclusive(repo, async () => {
      const state = await this.status(repo);
      this.validatePaths(state.staged, paths);
      await this.command(repo, state.head ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '-f', '--', ...paths], false);
    });
  }

  validatePaths(files, paths) {
    if (!paths.length || paths.some(path => !files.some(file => file.path === path))) throw new Error('The file list changed. Refresh and review the changes again.');
  }

  async commit(repo, message, expectedIndex) {
    return this.exclusive(repo, async () => {
      if (!message.trim()) throw new Error('Enter a commit message.');
      const state = await this.status(repo);
      if (state.conflicts.length) throw new Error('Resolve merge conflicts in your editor or terminal before committing.');
      if (!state.staged.length) throw new Error('There are no staged changes to commit.');
      if (expectedIndex !== undefined && state.index !== expectedIndex) throw new Error('Staged changes changed since the last refresh. Review them before committing.');
      const result = await this.command(repo, ['commit', '-m', message.trim()], false);
      return (result.stdout || 'Commit created').trim();
    });
  }

  async discardSnapshot(repo, path) {
    const state = await this.status(repo);
    this.validatePaths(state.unstaged, [path]);
    const file = state.unstaged.find(file => file.path === path);
    const index = await this.command(repo, ['ls-files', '--stage', '-z', '--', path]);
    if (index.stdout.split('\0').some(record => record.startsWith('160000 '))) throw new Error('Discard submodule changes from its own repository, not the parent.');
    let hash = '';
    if (file.y !== 'D') hash = (await this.command(repo, ['hash-object', '--no-filters', '--', path])).stdout.trim();
    return { untracked: file.untracked, fingerprint: JSON.stringify([file.x, file.y, index.stdout, hash]) };
  }

  async discard(repo, path, expected) {
    return this.exclusive(repo, async () => {
      if (!expected?.fingerprint) throw new Error('Review and confirm this discard first.');
      const current = await this.discardSnapshot(repo, path);
      if (current.fingerprint !== expected.fingerprint) throw new Error('This file changed after confirmation opened. Review it again before discarding.');
      await this.command(repo, current.untracked ? ['clean', '-f', '--', path] : ['restore', '--worktree', '--', path], false);
    });
  }

  async remote(repo, action) {
    return this.exclusive(repo, async () => {
      if (action === 'fetch') return (await this.command(repo, ['fetch', '--all'], false)).stdout;
      if (action !== 'pull' && action !== 'push') throw new Error('Unknown remote action.');
      const state = await this.status(repo);
      if (!state.upstream) throw new Error('No upstream branch is configured. Set it in the terminal before pulling or pushing.');
      if (action === 'pull' && state.files.length) throw new Error('Commit or discard local changes before pulling.');
      if (action === 'push' && state.behind) throw new Error('This branch is behind its upstream. Pull before pushing.');
      if (action === 'pull') return (await this.command(repo, ['pull', '--ff-only'], false)).stdout;
      const remote = (await this.command(repo, ['config', '--get', `branch.${state.branch}.remote`])).stdout.trim();
      const target = (await this.command(repo, ['config', '--get', `branch.${state.branch}.merge`])).stdout.trim();
      if (!remote || !target.startsWith('refs/heads/') || target.includes('\n')) throw new Error('The upstream configuration is ambiguous. Push from the terminal.');
      return (await this.command(repo, ['push', '--', remote, `HEAD:${target}`], false)).stdout;
    });
  }

  async diff(repo, path, group) {
    if (group !== 'staged' && group !== 'unstaged') throw new Error('Unknown diff group.');
    const state = await this.status(repo);
    this.validatePaths(state[group], [path]);
    const file = state[group].find(file => file.path === path);
    if (group === 'unstaged' && file.untracked) {
      const text = await this.readTextFile(`${repo.root}/${path}`, { on: repo.on });
      if (text === null) throw new Error('The file is no longer available. Refresh Source.');
      if (text.includes('\0')) return { patch: '', binary: true };
      const content = text.replace(/\n$/, '').split('\n');
      return { patch: text ? `@@ -0,0 +1,${content.length} @@\n${content.map(line => `+${line}`).join('\n')}` : '', empty: !text };
    }
    const result = await this.command(repo, ['diff', ...(group === 'staged' ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--ignore-submodules=dirty', '--unified=3', '--', path]);
    return { patch: result.stdout, binary: /^Binary files .* differ$|^GIT binary patch$/m.test(result.stdout) };
  }
}
