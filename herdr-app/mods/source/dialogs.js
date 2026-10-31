import { div } from 'gpui-kit';
import { h_flex, v_flex, InputState, Checkbox, v_virtual_list, Scrollbar } from 'gpui-base';
import { settings, pickFolder, setShared, shared, focused, closeOverlay } from 'herdr';
import { git, selections, revision, invalidate, sourceTheme, button, input, message, dialog, openDiscard, action, closeSourceDiff, showSourceTerminals } from './ui.js';
import { diffRows } from './diff.js';

export class Picker {
  init(props, cx) {
    this.props = props; this.repositories = [...props.selected]; this.selected = new Set(props.selected.map(repo => repo.key));
    this.search = InputState.new({ placeholder: 'Search repositories' });
    this.search.on('change', (_event, cx) => cx.notify());
    this.path = InputState.new({ placeholder: 'Absolute repository path on this machine' });
    this.path.on('submit', (_event, cx) => this.addPath(this.path.value(), cx));
    this.scan(cx);
  }

  scan(cx) {
    if (this.loading) return;
    this.loading = true; this.error = null;
    cx.spawn(async cx => {
      try {
        const found = await git.discover(this.props.cwd, this.props.on);
        const all = new Map(this.repositories.map(repo => [repo.key, repo]));
        for (const repo of found.repositories) all.set(repo.key, repo);
        this.repositories = [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
        this.warning = [found.limited ? 'Discovery is limited to 500 immediate child repositories. Add other folders manually.' : '', ...found.errors].filter(Boolean).join('\n');
      } catch (error) { this.error = String(error); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  addPath(path, cx) {
    if (!path.trim() || this.adding) return;
    this.adding = true; this.error = null;
    const on = this.props.on;
    cx.spawn(async cx => {
      try {
        const repo = await git.resolve(path.trim(), on);
        if (!this.repositories.some(item => item.key === repo.key)) this.repositories.push(repo);
        this.selected.add(repo.key); this.showPath = false; this.search.set_value('');
      } catch (error) { this.error = String(error); }
      finally { this.adding = false; cx.notify(); }
    });
  }

  add(cx) {
    if (this.props.on) { this.showPath = !this.showPath; cx.notify(); return; }
    this.adding = true; cx.notify();
    cx.spawn(async cx => {
      try { const path = await pickFolder({ prompt: 'Add repository' }); this.adding = false; if (path) this.addPath(path, cx); }
      catch (error) { this.adding = false; this.error = String(error); }
      cx.notify();
    });
  }

  apply() {
    const current = selections()[this.props.tabKey];
    setShared('source.tabs', { ...selections(), [this.props.tabKey]: {
      ...current, cwd: current?.cwd ?? this.props.cwd, on: this.props.on, initializing: false, error: null,
      repositories: this.repositories.filter(repo => this.selected.has(repo.key)),
    } });
    invalidate(); closeOverlay(this.props.overlay);
  }

  render() {
    const t = sourceTheme(), query = this.search.value().toLowerCase();
    const matches = this.repositories.filter(repo => `${repo.name} ${repo.root}`.toLowerCase().includes(query));
    const body = v_flex().flex_1().min_h(0)
      .child(v_flex().px(18).py(13).gap(10).child(div().text_size(11).text_color(t.muted).truncate().tooltip(this.props.cwd).child(`${this.props.on ? `${this.props.on}:` : ''}${this.props.cwd} · immediate child repositories`))
        .child(input('source-repo-search', this.search, 'Search repositories')))
      .child(v_flex().id('source-picker-list').flex_1().min_h(0).overflow_y_scrollbar().px(10).pb(8)
        .children(matches.map(repo => Checkbox.new(`source-pick-${repo.key}`).checked(this.selected.has(repo.key))
          .accessibility_label(`${repo.name}, ${repo.on ? `${repo.on}:` : ''}${repo.root}`).tooltip(repo.root)
          .px(9).py(10).gap(12).flex().items_center().rounded(5).hover(s => s.bg(t.hover))
          .on_click((_event, cx) => { if (this.selected.has(repo.key)) this.selected.delete(repo.key); else this.selected.add(repo.key); cx.notify(); })
          .child(div().w(16).h(16).flex_none().rounded(3).border_1().border_color(this.selected.has(repo.key) ? t.accent : t.input).bg(this.selected.has(repo.key) ? t.selected : t.chrome).text_size(11).text_color(t.accent).flex().items_center().justify_center().child(this.selected.has(repo.key) ? '✓' : ''))
          .child(v_flex().flex_1().min_w(0).gap(4).child(div().truncate().child(repo.name)).child(div().truncate().text_size(10).text_color(t.dim).child(repo.root)))))
        .when(matches.length === 0, el => el.child(message(this.loading ? 'Finding repositories…' : query ? 'No matching repositories.' : 'No repositories found. Add a folder to begin.'))))
      .when(Boolean(this.warning), el => el.child(message(this.warning, t.blocked)))
      .when(Boolean(this.error), el => el.child(h_flex().items_center().child(message(this.error, t.ansi1).flex_1()).child(button('source-picker-retry', 'Retry', cx => this.scan(cx), { disabled: this.loading }))))
      .when(Boolean(this.showPath), el => el.child(v_flex().px(18).py(10).gap(7).child(div().text_size(11).text_color(t.muted).child(`Repository path on ${this.props.on}`))
        .child(h_flex().gap(8).child(input('source-add-path', this.path, `Repository path on ${this.props.on}`).flex_1()).child(button('source-add-path-submit', 'Add', cx => this.addPath(this.path.value(), cx), { disabled: this.adding })))));
    const footer = h_flex().px(18).py(12).gap(8).items_center().border_t(1).border_color(t.border)
      .child(button('source-add-folder', this.adding ? 'Adding…' : '+ Add folder…', cx => this.add(cx), { disabled: this.adding }))
      .child(div().flex_1()).child(div().text_size(11).text_color(t.muted).child(`${this.selected.size} selected`))
      .child(button('source-apply-selection', 'Apply selection', () => this.apply(), { primary: true, disabled: this.adding }));
    return dialog(`Repositories for ${this.props.name}`, null, body, footer, this.props.overlay).h_full();
  }

  close() { this.search.release(); this.path.release(); }
}

export class MainDiff {
  init() { this.diff = null; this.targetId = null; }

  render(cx) {
    const target = shared('source.diff'), focus = focused();
    if (!target || (focus?.space && focus?.tab && (focus.space !== target.space || focus.tab !== target.tab))) {
      showSourceTerminals();
      return div().size_full().bg(sourceTheme().background);
    }
    if (this.targetId !== target.id) {
      const previous = this.diff;
      this.targetId = target.id;
      this.diff = new Diff();
      this.diff.init({ ...target, embedded: true }, cx);
      if (previous) { this.diff.width = previous.width; this.diff.mode = previous.mode; }
    }
    return this.diff.render(cx);
  }
}

export class Diff {
  init(props, cx) {
    this.props = props; this.mode = 'split'; this.rows = { unified: [], split: [], width: 0 }; this.width = 1000;
    this.seenRevision = revision();
    this.load(cx);
  }

  load(cx) {
    if (this.loading || this.busy) return;
    this.loading = true; this.error = null;
    const { repo, path, group } = this.props;
    cx.spawn(async cx => {
      try {
        const diff = await git.diff(repo, path, group);
        this.rows = diffRows(diff.patch); this.binary = diff.binary; this.empty = diff.empty;
      } catch (error) { this.error = String(error); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  mutate(cx) {
    const { repo, path, group } = this.props;
    action(this, repo, group === 'staged' ? 'Unstage file' : 'Stage file', () => group === 'staged' ? git.unstage(repo, [path]) : git.stage(repo, [path]), cx, () => this.dismiss());
  }

  dismiss() {
    if (this.props.embedded) closeSourceDiff(this.props.id);
    else closeOverlay(this.props.overlay);
  }

  cell(row, width) {
    const t = sourceTheme();
    return h_flex().w(width).h(22).flex_none().gap(8)
      .bg(!row ? t.raised : row.kind === 'added' ? t.diff_added_background : row.kind === 'removed' ? t.diff_removed_background : t.background)
      .child(div().w(45).flex_none().text_right().text_color(t.dim).child(row?.number === undefined ? '' : String(row.number)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(row?.text || ' '));
  }

  row(row, halfWidth, fullWidth) {
    const t = sourceTheme();
    if (row.kind === 'hunk' || row.kind === 'note') return div().h(22).w(fullWidth).px(14).bg(t.raised).text_color(t.dim).truncate().child(row.text);
    if (this.mode === 'split') return h_flex().w(fullWidth).h(22).child(this.cell(row.left, halfWidth)).child(this.cell(row.right, halfWidth).border_l(1).border_color(t.border));
    return h_flex().w(fullWidth).h(22).gap(8)
      .bg(row.kind === 'added' ? t.diff_added_background : row.kind === 'removed' ? t.diff_removed_background : t.background)
      .child(div().w(40).flex_none().text_right().text_color(t.dim).child(row.old === undefined ? '' : String(row.old)))
      .child(div().w(40).flex_none().text_right().text_color(t.dim).child(row.next === undefined ? '' : String(row.next)))
      .child(div().w(12).flex_none().text_color(row.kind === 'added' ? t.git_added : row.kind === 'removed' ? t.git_deleted : t.dim).child(row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(row.text || ' '));
  }

  render(cx) {
    if (this.seenRevision !== revision()) { this.seenRevision = revision(); this.load(cx); }
    const t = sourceTheme(), { repo, path, group, overlay } = this.props, staged = group === 'staged';
    const rows = this.rows[this.mode === 'split' ? 'split' : 'unified'];
    const longest = this.rows.width;
    const halfWidth = Math.max(this.width / 2 - 1, Math.min(4000, longest) * 7 + 65);
    const fullWidth = this.mode === 'split' ? halfWidth * 2 : Math.max(this.width, longest * 7 + 110);
    const disabled = Boolean(this.busy || this.loading || this.error);
    const modes = h_flex().gap(7).items_center()
      .child(button('source-diff-split', 'Side by side', cx => { this.mode = 'split'; cx.notify(); }, { ghost: true }).bg(this.mode === 'split' ? t.selected : t.chrome).text_color(this.mode === 'split' ? t.foreground : t.muted))
      .child(button('source-diff-unified', 'Unified', cx => { this.mode = 'unified'; cx.notify(); }, { ghost: true }).bg(this.mode === 'unified' ? t.selected : t.chrome).text_color(this.mode === 'unified' ? t.foreground : t.muted));
    const controls = h_flex().gap(7).items_center()
      .child(button('source-diff-refresh', 'Refresh', cx => this.load(cx), { disabled: Boolean(this.busy || this.loading) }))
      .when(!staged, el => el.child(button('source-diff-discard', 'Discard…', () => openDiscard(repo, path), { disabled, danger: true })))
      .child(button('source-diff-stage', this.busy || (staged ? 'Unstage file' : 'Stage file'), cx => this.mutate(cx), { disabled, primary: true }));
    const toolbar = v_flex().px(18).py(10).gap(7).border_b(1).border_color(t.border)
      .when(this.width < 470, el => el.child(modes).child(controls))
      .when(this.width >= 470, el => el.child(h_flex().gap(7).items_center().child(modes).child(div().flex_1()).child(controls)));
    const labels = h_flex().bg(t.raised).border_b(1).border_color(t.border).text_size(10).text_color(t.muted)
      .when(this.mode === 'split', el => el
        .child(div().flex_1().px(18).py(9).child(staged ? 'HEAD · last commit' : 'INDEX · staged version'))
        .child(div().flex_1().px(18).py(9).border_l(1).border_color(t.border).child(staged ? 'INDEX · staged version' : 'WORKING TREE · on disk')))
      .when(this.mode === 'unified', el => el.child(div().px(18).py(9).child(staged ? 'HEAD → INDEX' : 'INDEX → WORKING TREE')));
    const content = v_flex().flex_1().min_h(0).child(toolbar)
      .child(div().flex_1().min_h(0).relative().bg(t.background).font_family(settings().font_family ?? 'JetBrains Mono').text_size(12)
        .child(div().id('source-diff-horizontal').size_full().overflow_x_scrollbar()
          .child(v_flex().w_full().min_w(fullWidth).h_full().child(labels).child(v_virtual_list(`source-diff-${this.mode}`, rows.length, 22, index => `${this.mode}-${index}`,
            range => rows.slice(range.start, range.end).map(row => this.row(row, halfWidth, fullWidth))).flex_1().min_h(0))))
        .child(Scrollbar.vertical(`source-diff-${this.mode}`).viewport_from_layout().absolute().inset_0())
        .when(Boolean(this.loading || this.error || this.binary || !rows.length), el => el.child(div().absolute().top(15).left(8).max_w(850).child(message(this.loading ? 'Loading diff…' : this.error || (this.binary ? 'Binary file changed. No text diff is available.' : this.empty ? 'Empty untracked file. There is no text to compare.' : 'No text diff is available. The change may only affect a file mode or an empty file.'), this.error ? t.ansi1 : t.muted)))));
    const footer = this.rows.limited ? h_flex().px(18).py(10).border_t(1).border_color(t.border).text_size(10).text_color(t.muted)
      .child('Preview limited to 3,000 rows and 4,000 characters per line. File actions still apply to the entire file.') : null;
    return dialog(path, `${repo.on ? `${repo.on}:` : ''}${repo.name} / ${staged ? 'Staged Changes' : 'Changes'}`, content, footer, overlay, null, () => this.dismiss()).h_full()
      .when(Boolean(this.props.embedded), el => el.rounded(10).border_1().border_color(t.border))
      .id('source-diff-root').on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } });
  }
}

export class Discard {
  init(props, cx) {
    this.props = props;
    this.load(cx);
  }

  load(cx) {
    this.loading = true; this.error = null; this.snapshot = null;
    cx.spawn(async cx => {
      try { this.snapshot = await git.discardSnapshot(this.props.repo, this.props.path); }
      catch (error) { this.error = String(error); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  render() {
    const t = sourceTheme(), { repo, path, overlay } = this.props;
    const untracked = this.snapshot?.untracked;
    const body = v_flex().px(18).py(16).gap(13)
      .child(div().font_semibold().child(repo.name))
      .child(div().text_size(12).child(path))
      .child(div().text_color(t.muted).text_size(12).child(untracked ? 'This deletes the untracked file. Git has no staged version to restore.' : 'This restores the working file to its staged version. Any staged changes stay staged.'))
      .child(div().text_color(t.ansi1).text_size(12).child('This cannot be undone from Source.'))
      .when(this.loading, el => el.child(message('Checking the file…')))
      .when(Boolean(this.error), el => el.child(message(this.error, t.ansi1)));
    const footer = h_flex().px(18).py(12).gap(8).justify_end().border_t(1).border_color(t.border)
      .child(button('source-discard-cancel', 'Cancel', () => closeOverlay(overlay)))
      .when(Boolean(this.error), el => el.child(button('source-discard-review', 'Review again', cx => this.load(cx), { disabled: Boolean(this.busy || this.loading) })))
      .child(button('source-discard-confirm', this.busy || (untracked ? 'Delete file' : 'Discard changes'), cx => {
        const snapshot = this.snapshot;
        action(this, repo, untracked ? 'Delete file' : 'Discard changes', () => git.discard(repo, path, snapshot), cx, () => closeOverlay(overlay));
      }, { danger: true, disabled: !this.snapshot || Boolean(this.busy || this.loading || this.error) }));
    return dialog(untracked ? 'Delete untracked file?' : 'Discard unstaged changes?', repo.on ? `Machine: ${repo.on}` : null, body, footer, overlay);
  }
}
