import { div, svg } from 'gpui-kit';
import { h_flex, v_flex, InputState } from 'gpui-base';
import { spaces, panes, focused, theme, shared, setShared, openOverlay, watchFolder } from 'herdr';
import { FILE_LIMIT } from './git.js';
import { git, selections, revision, button, input, message, openDiff, openDiscard, action } from './ui.js';

export function contextOf() {
  const focus = focused();
  const space = spaces().find(space => space.id === focus?.space) ?? spaces().find(space => space.active);
  const tab = space?.tabs.find(tab => tab.id === focus?.tab) ?? space?.tabs.find(tab => tab.active);
  if (!space || !tab) return null;
  const terminals = panes().filter(pane => pane.tab === tab.id && pane.cwd);
  const cwd = terminals.find(pane => pane.pane === focus?.pane)?.cwd || (focus?.tab === tab.id ? focus.cwd : null) || terminals[0]?.cwd || space.folder;
  return { key: JSON.stringify([space.machine, space.id, tab.id]), name: tab.name, on: space.machine, cwd };
}

export default class Panel {
  init(_props, cx) {
    this.entries = new Map(); this.initializing = new Set(); this.watches = new Set(); this.dirty = new Set();
    this.seenRevision = revision();
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
    cx.timer.every(1000, cx => {
      for (const key of this.dirty) {
        const entry = this.entries.get(key);
        if (entry && this.selected().some(repo => repo.key === key)) this.reload(entry, cx);
      }
      this.dirty.clear();
    });
  }

  selected() {
    const context = contextOf();
    return context ? selections()[context.key]?.repositories ?? [] : [];
  }

  initialize(context, cx) {
    const saved = selections()[context.key];
    if (!context.cwd || (saved && !saved.initializing) || git.initializing.has(context.key)) return;
    git.initializing.add(context.key); this.initializing.add(context.key);
    const initial = saved ?? { cwd: context.cwd, on: context.on, repositories: [], initializing: true };
    setShared('source.tabs', { ...selections(), [context.key]: initial });
    cx.spawn(async cx => {
      let repositories = [], error = null;
      try { repositories = [await git.resolve(initial.cwd, initial.on)]; }
      catch (e) { if (!/not a git repository/i.test(String(e))) error = String(e); }
      const current = selections()[context.key];
      if (current?.initializing) setShared('source.tabs', { ...selections(), [context.key]: { ...current, repositories, initializing: false, error } });
      git.initializing.delete(context.key); this.initializing.delete(context.key);
      this.refresh(cx); cx.notify();
    });
  }

  refresh(cx) {
    const context = contextOf();
    if (!context || this.closed) return;
    this.initialize(context, cx);
    for (const repo of this.selected()) {
      let entry = this.entries.get(repo.key);
      if (!entry) {
        entry = { repo, data: null, input: null, epoch: 0, collapsed: false, watching: true };
        this.entries.set(repo.key, entry);
      }
      entry.watching = true;
      this.reload(entry, cx);
    }
    const selected = new Set(this.selected().map(repo => repo.key));
    for (const entry of this.entries.values()) if (!selected.has(entry.repo.key)) entry.watching = false;
  }

  watch(entry, cx) {
    if (entry.repo.on) return;
    for (const dir of new Set([entry.repo.root, entry.repo.gitDir])) {
      const key = JSON.stringify([entry.repo.key, dir]);
      if (!dir || this.watches.has(key)) continue;
      this.watches.add(key);
      cx.spawn(async cx => {
        try {
          while (!this.closed && entry.watching) {
            await watchFolder(dir);
            if (this.closed || !entry.watching) break;
            this.dirty.add(entry.repo.key);
          }
        } catch { /* Polling remains available if watching fails. */ }
        finally { this.watches.delete(key); }
      });
    }
  }

  reload(entry, cx) {
    if (entry.busy) return;
    if (entry.loading) { entry.again = true; return; }
    entry.loading = true;
    const epoch = entry.epoch;
    cx.spawn(async cx => {
      try {
        const data = await git.status(entry.repo);
        if (entry.epoch !== epoch || this.closed) return;
        entry.data = data; entry.error = null;
        if (!entry.input) {
          entry.input = InputState.new({ placeholder: 'Summarize the staged changes', value: shared('source.drafts')?.[entry.repo.key] ?? '' });
          entry.input.on('change', (_event, cx) => {
            setShared('source.drafts', { ...(shared('source.drafts') ?? {}), [entry.repo.key]: entry.input.value() });
            cx.notify();
          });
          entry.input.on('submit', (_event, cx) => this.commit(entry, cx));
        }
        this.watch(entry, cx);
      } catch (error) { if (entry.epoch === epoch) entry.error = String(error); }
      finally {
        entry.loading = false;
        if (entry.again) { entry.again = false; this.reload(entry, cx); }
        cx.notify();
      }
    });
  }

  perform(entry, label, work, cx, done) {
    if (entry.busy || entry.error || !entry.data) return;
    entry.epoch++;
    action(entry, entry.repo, label, work, cx, done);
  }

  commit(entry, cx) {
    const value = entry.input?.value() ?? '';
    if (!value.trim() || !entry.data?.staged.length || entry.data.conflicts.length) return;
    const expected = entry.data.index;
    this.perform(entry, 'Commit', () => git.commit(entry.repo, value, expected), cx, () => {
      if (entry.input.value() === value) {
        entry.input.set_value('');
        setShared('source.drafts', { ...(shared('source.drafts') ?? {}), [entry.repo.key]: '' });
      }
    });
  }

  picker(context) {
    const saved = selections()[context.key];
    openOverlay({ mod: 'source', kind: 'dialog', modal: true, width: 620, height: .77,
      props: { view: 'picker', tabKey: context.key, name: context.name, cwd: saved?.cwd || context.cwd, on: saved?.on ?? context.on, selected: saved?.repositories ?? [] } });
  }

  group(entry, group) {
    const t = theme(), state = entry.data, staged = group === 'staged', files = state[group];
    const disabled = Boolean(entry.busy || entry.error);
    const operation = staged ? 'Unstage' : 'Stage';
    return v_flex().pb(8)
      .child(h_flex().h(29).px(13).gap(6).items_center()
        .child(div().text_size(11).text_color(t.muted).child(staged ? 'Staged Changes' : 'Changes'))
        .child(div().text_size(10).text_color(t.dim).child(String(files.length)))
        .child(div().flex_1())
        .when(files.length > 0, el => el.child(button(`source-${entry.repo.key}-${group}-all`, `${operation} all`, cx => {
          const paths = files.map(file => file.path);
          this.perform(entry, `${operation} all`, () => staged ? git.unstage(entry.repo, paths) : git.stage(entry.repo, paths), cx);
        }, { disabled: disabled || state.limited || state.conflicts.length > 0, tooltip: state.limited ? 'Bulk actions are disabled while the file list is limited' : state.conflicts.length ? 'Resolve merge conflicts before using bulk actions' : `${operation} all in ${entry.repo.name}` }))))
      .children(files.slice(0, FILE_LIMIT).map(file => {
        const parts = file.path.split('/'), name = parts.pop(), id = `${entry.repo.key}-${group}-${file.path}`;
        return h_flex().id(`source-file-${id}`).h(29).px(8).gap(2).items_center().hover(s => s.bg(t.hover))
          .child(button(`source-diff-${id}`, name, () => openDiff(entry.repo, file, group), { disabled: Boolean(entry.busy), tooltip: `${file.path} · ${staged ? 'HEAD → index' : 'Index → working tree'}` })
            .flex_1().min_w(0).justify_start().px(5).bg(t.chrome).overflow_hidden()
            .child(div().ml(6).flex_1().min_w(0).truncate().text_color(t.dim).text_size(10).child(parts.join('/'))))
          .child(div().w(12).text_size(10).text_color(file.status === 'D' ? t.ansi1 : file.status === '?' || file.status === 'A' ? t.ansi2 : t.blocked).child(file.status === '?' ? 'U' : file.status))
          .when(!staged, el => el.child(button(`source-discard-${id}`, '↶', () => openDiscard(entry.repo, file.path), { disabled, tooltip: `Discard unstaged changes to ${file.path}` }).w(25).px(0)))
          .child(button(`source-stage-${id}`, staged ? '−' : '+', cx => this.perform(entry, operation, () => staged ? git.unstage(entry.repo, [file.path]) : git.stage(entry.repo, [file.path]), cx), { disabled, tooltip: `${operation} ${file.path}` }).w(25).px(0));
      }))
      .when(files.length === 0, el => el.child(div().px(14).py(5).text_size(11).text_color(t.dim).child(staged ? 'No staged changes' : 'No unstaged changes')));
  }

  repository(entry) {
    const t = theme(), state = entry.data, repo = entry.repo;
    const disabled = Boolean(entry.busy || entry.error || !state);
    return v_flex().border_b(1).border_color(t.border)
      .child(h_flex().px(12).pt(9).gap(5).items_center()
        .child(button(`source-repo-${repo.key}`, `${entry.collapsed ? '›' : '⌄'}  ${repo.name}`, cx => { entry.collapsed = !entry.collapsed; cx.notify(); }, { tooltip: `${repo.on ? `${repo.on}:` : ''}${repo.root}` }).flex_1().min_w(0).justify_start().px(0).bg(t.chrome).overflow_hidden())
        .when(Boolean(state), el => el.child(div().text_size(10).text_color(t.dim).child(String(state.files.length)))))
      .child(h_flex().px(14).pl(27).pb(7).gap(7).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(10).text_color(t.muted).child(state ? `⑂ ${state.branch}` : 'Loading repository…'))
        .when(Boolean(state?.upstream), el => el.child(div().text_size(10).text_color(t.dim).child(`↑${state.ahead} ↓${state.behind}`))))
      .when(!entry.collapsed, el => el
        .child(h_flex().px(13).pb(8).gap(4).children(['Fetch', 'Pull', 'Push'].map(label => button(`source-${label}-${repo.key}`, label, cx => this.perform(entry, label, () => git.remote(repo, label.toLowerCase()), cx), { disabled, tooltip: `${label} ${repo.name}${label === 'Pull' ? ' (fast-forward only)' : ''}` }))))
        .when(Boolean(entry.input), el => el.child(v_flex().px(13).pb(11).gap(6)
          .child(div().text_size(10).text_color(t.muted).child('Commit message'))
          .child(input(`source-message-${repo.key}`, entry.input, `Commit message for ${repo.name}`))
          .child(h_flex().gap(8).items_center()
            .child(button(`source-commit-${repo.key}`, entry.busy || `Commit${state?.staged.length ? ` ${state.staged.length} staged` : ''}`, cx => this.commit(entry, cx), { primary: true, disabled: disabled || !entry.input.value().trim() || !state?.staged.length || Boolean(state.conflicts.length), tooltip: `Commit only staged changes in ${repo.name}` }).flex_1())
            .child(div().text_size(10).text_color(t.dim).child(`${state?.unstaged.length ?? 0} unstaged`)))))
        .when(Boolean(entry.error), el => el.child(message(`Refresh / operation failed: ${entry.error}`, t.ansi1)))
        .when(Boolean(entry.busy), el => el.child(h_flex().px(14).pb(8).gap(6).child(div().frames(['⠋', '⠙', '⠹', '⠸'], 100).text_color(t.accent)).child(div().text_size(11).text_color(t.muted).child(`${entry.busy}…`))))
        .when(Boolean(state?.conflicts.length), el => el.child(message(`${state.conflicts.length} merge conflict(s). Resolve them in your editor or terminal.`, t.ansi1)))
        .when(Boolean(state), el => el.child(this.group(entry, 'staged')).child(this.group(entry, 'unstaged')))
        .when(Boolean(state?.limited), el => el.child(message(`Showing at most ${FILE_LIMIT} files per group. Bulk actions are disabled. Use the terminal for this large change.`))));
  }

  render(cx) {
    const context = contextOf(), token = context?.key;
    if (this.context !== token || this.seenRevision !== revision()) {
      this.context = token; this.seenRevision = revision(); this.refresh(cx);
    }
    const saved = context ? selections()[context.key] : null, selected = saved?.repositories ?? [], t = theme();
    const missing = selected.some(repo => !this.entries.has(repo.key));
    if (missing) this.refresh(cx);
    return v_flex().id('source').size_full().min_h(0).rounded(10).overflow_hidden().bg(t.chrome).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(46).flex_none().px(13).gap(8).items_center().border_b(1).border_color(t.border)
        .child(svg('mods/source/source.svg').size(16).text_color(t.muted))
        .child(div().font_semibold().child('Source')).child(div().flex_1())
        .child(button('source-refresh', '↻', cx => this.refresh(cx), { tooltip: 'Refresh source control' }))
        .child(button('source-select', `${selected.length} repositories ⌄`, () => this.picker(context), { disabled: !context || Boolean(saved?.initializing), tooltip: 'Choose repositories for this tab' })))
      .child(h_flex().px(13).py(10).gap(7).border_b(1).border_color(t.border).text_size(10).text_color(t.muted)
        .child(div().flex_1().min_w(0).truncate().child(context?.name ?? 'No active tab'))
        .child(div().child('Pinned to this tab')))
      .child(v_flex().id('source-repositories').flex_1().min_h(0).overflow_y_scrollbar().pb(18)
        .when(selected.length === 0, el => el.child(v_flex().p(16).gap(10)
          .child(div().font_semibold().child(saved?.initializing ? 'Finding repository…' : 'No repositories selected'))
          .child(div().text_size(12).text_color(t.muted).child('Choose the projects you want to review in this tab.'))
          .when(Boolean(context && !saved?.initializing), el => el.child(button('source-empty-select', 'Choose repositories', () => this.picker(context))))
          .when(Boolean(saved?.error), el => el.child(message(saved.error, t.ansi1)))))
        .children(selected.map(repo => this.entries.get(repo.key)).filter(Boolean).map(entry => this.repository(entry))));
  }

  close() {
    this.closed = true;
    for (const key of this.initializing) git.initializing.delete(key);
    for (const entry of this.entries.values()) entry.input?.release();
  }
}
