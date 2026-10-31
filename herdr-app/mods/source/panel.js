import { div, svg } from 'gpui-kit';
import { h_flex, v_flex, InputState } from 'gpui-base';
import { spaces, panes, focused, shared, setShared, openOverlay, watchFolder } from 'herdr';
import { FILE_LIMIT } from './git.js';
import { git, selections, revision, sourceTheme, button, input, message, openDiff, currentSourceDiff, openDiscard, action } from './ui.js';

function sourceIconButton(id, icon, tooltip, action, disabled = false) {
  const t = sourceTheme();
  return button(id, '', action, { ghost: true, disabled, tooltip }).w(28).px(0)
    .child(svg(`mods/source/${icon}.svg`).size(14).text_color(disabled ? t.disabled : t.muted));
}

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
          entry.input = InputState.new({ value: shared('source.drafts')?.[entry.repo.key] ?? '' });
          entry.input.on('change', (_event, cx) => {
            setShared('source.drafts', { ...(shared('source.drafts') ?? {}), [entry.repo.key]: entry.input.value() });
            cx.notify();
          });
          entry.input.on('submit', (_event, cx) => this.commit(entry, cx));
          entry.input.on('focus', (_event, cx) => { entry.inputFocused = true; cx.notify(); });
          entry.input.on('blur', (_event, cx) => { entry.inputFocused = false; cx.notify(); });
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
    const t = sourceTheme(), state = entry.data, staged = group === 'staged', files = state[group];
    const disabled = Boolean(entry.busy || entry.error);
    const operation = staged ? 'Unstage' : 'Stage', selected = currentSourceDiff();
    return v_flex().pb(8)
      .child(h_flex().h(36).px(14).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().text_size(11).font_semibold().text_color(t.foreground).child(staged ? 'Staged Changes' : 'Changes'))
        .child(div().px(6).py(1).rounded(8).bg(t.raised).text_size(10).text_color(t.muted).child(String(files.length)))
        .child(div().flex_1())
        .when(files.length > 0, el => el.child(sourceIconButton(`source-${entry.repo.key}-${group}-all`, staged ? 'minus' : 'plus', state.limited ? 'Bulk actions are disabled while the file list is limited' : state.conflicts.length ? 'Resolve merge conflicts before using bulk actions' : `${operation} all in ${entry.repo.name}`, cx => {
          const paths = files.map(file => file.path);
          this.perform(entry, `${operation} all`, () => staged ? git.unstage(entry.repo, paths) : git.stage(entry.repo, paths), cx);
        }, disabled || state.limited || state.conflicts.length > 0))))
      .children(files.slice(0, FILE_LIMIT).map(file => {
        const parts = file.path.split('/'), name = parts.pop(), id = `${entry.repo.key}-${group}-${file.path}`;
        const showActions = this.hoveredFile === id;
        const isSelected = selected?.repo.key === entry.repo.key && selected?.group === group && selected?.path === file.path;
        const rowBackground = isSelected ? t.selected : showActions ? t.hover : t.chrome;
        return h_flex().id(`source-file-${id}`).h(30).px(8).gap(2).items_center().bg(rowBackground)
          .on_hover((hovered, cx) => {
            if (hovered) this.hoveredFile = id;
            else if (this.hoveredFile === id) this.hoveredFile = null;
            cx.notify();
          })
          .child(button(`source-diff-${id}`, '', () => openDiff(entry.repo, file, group), { ghost: true, disabled: Boolean(entry.busy), tooltip: `${file.path} · ${staged ? 'HEAD → index' : 'Index → working tree'} · Open diff for file actions` })
            .flex_1().min_w(0).justify_start().px(6).text_size(12).overflow_hidden().bg(rowBackground)
            .child(svg('mods/source/file.svg').size(14).flex_none().text_color(t.muted))
            .child(div().ml(8).min_w(0).truncate().text_color(t.foreground).child(name))
            .when(parts.length > 0, el => el.child(div().ml(7).flex_1().min_w(0).truncate().text_color(t.dim).text_size(10).child(parts.join('/')))))
          .when(showActions && !staged, el => el.child(sourceIconButton(`source-discard-${id}`, 'discard', `Discard unstaged changes to ${file.path}`, () => openDiscard(entry.repo, file.path), disabled).bg(rowBackground).when(!disabled, control => control.hover(s => s.bg(t.hover)))))
          .when(showActions && staged, el => el.child(div().w(28).flex_none()))
          .when(showActions, el => el.child(sourceIconButton(`source-stage-${id}`, staged ? 'minus' : 'plus', `${operation} ${file.path}`, cx => this.perform(entry, operation, () => staged ? git.unstage(entry.repo, [file.path]) : git.stage(entry.repo, [file.path]), cx), disabled).bg(rowBackground).when(!disabled, control => control.hover(s => s.bg(t.hover)))))
          .child(div().w(16).flex_none().text_center().text_size(11).text_color(file.status === 'D' ? t.git_deleted : file.status === '?' || file.status === 'A' ? t.git_added : t.git_modified).child(file.status === '?' ? 'U' : file.status));
      }))
      .when(files.length === 0, el => el.child(div().px(14).py(5).text_size(11).text_color(t.dim).child(staged ? 'No staged changes' : 'No unstaged changes')));
  }

  repository(entry) {
    const t = sourceTheme(), state = entry.data, repo = entry.repo;
    const disabled = Boolean(entry.busy || entry.error || !state);
    const commitDisabled = disabled || !entry.input?.value().trim() || !state?.staged.length || Boolean(state?.conflicts.length);
    return v_flex().border_b(1).border_color(t.border)
      .child(h_flex().px(10).pt(10).gap(8).items_center()
        .child(button(`source-repo-${repo.key}`, '', cx => { entry.collapsed = !entry.collapsed; cx.notify(); }, { ghost: true, tooltip: `${repo.on ? `${repo.on}:` : ''}${repo.root}` }).flex_1().min_w(0).justify_start().px(4).text_size(13).font_semibold().text_color(t.foreground).overflow_hidden()
          .child(svg(`mods/source/chevron-${entry.collapsed ? 'right' : 'down'}.svg`).size(13).flex_none().text_color(t.muted))
          .child(div().ml(6).min_w(0).truncate().child(repo.name)))
        .when(Boolean(state), el => el.child(div().pr(4).text_size(10).text_color(t.dim).child(`${state.files.length} ${state.files.length === 1 ? 'file' : 'files'}`))))
      .when(!entry.collapsed, el => el
        .child(h_flex().px(14).pb(10).gap(7).items_center()
          .child(svg('mods/source/git-branch.svg').size(13).flex_none().text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(state ? state.branch : 'Loading repository…'))
          .when(Boolean(state?.upstream), row => row.child(div().text_size(10).text_color(t.dim).child(`↑${state.ahead} ↓${state.behind}`))))
        .child(h_flex().px(14).pb(14).gap(6).children(['Fetch', 'Pull', 'Push'].map(label => button(`source-${label}-${repo.key}`, label, cx => this.perform(entry, label, () => git.remote(repo, label.toLowerCase()), cx), { disabled, tooltip: `${label} ${repo.name}${label === 'Pull' ? ' (fast-forward only)' : ''}` }).flex_1().text_color(disabled ? t.disabled : t.foreground))))
        .when(Boolean(entry.input), el => el.child(v_flex().px(14).pb(16).gap(7)
          .child(div().text_size(11).text_color(t.muted).child('Commit message'))
          .child(input(`source-message-${repo.key}`, entry.input, `Commit message for ${repo.name}`, { focused: entry.inputFocused }))
          .child(button(`source-commit-${repo.key}`, '', cx => this.commit(entry, cx), { primary: true, disabled: commitDisabled, tooltip: `Commit only staged changes in ${repo.name}` }).h(32).w_full().text_size(12)
            .child(svg('mods/source/check.svg').size(14).text_color(commitDisabled ? t.disabled : t.solid_foreground))
            .child(div().ml(7).child(entry.busy || `Commit${state?.staged.length ? ` ${state.staged.length} staged` : ''}`)))))
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
    const saved = context ? selections()[context.key] : null, selected = saved?.repositories ?? [], t = sourceTheme();
    const missing = selected.some(repo => !this.entries.has(repo.key));
    if (missing) this.refresh(cx);
    return v_flex().id('source').size_full().min_h(0).rounded(10).overflow_hidden().bg(t.chrome).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(48).flex_none().px(14).gap(9).items_center().border_b(1).border_color(t.border)
        .child(svg('mods/source/source.svg').size(16).text_color(t.muted))
        .child(div().font_semibold().child('Source Control')).child(div().flex_1())
        .child(sourceIconButton('source-refresh', 'refresh', 'Refresh source control', cx => this.refresh(cx)))
        .child(button('source-select', `${selected.length} ${selected.length === 1 ? 'repository' : 'repositories'} ⌄`, () => this.picker(context), { ghost: true, disabled: !context || Boolean(saved?.initializing), tooltip: 'Choose repositories for this tab' })))
      .child(v_flex().id('source-repositories').flex_1().min_h(0).overflow_y_scrollbar().pb(18)
        .when(selected.length === 0, el => el.child(v_flex().p(16).gap(10)
          .child(div().font_semibold().child(saved?.initializing ? 'Finding repository…' : 'No repositories selected'))
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
