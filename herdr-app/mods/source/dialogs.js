import { div } from 'gpui-kit';
import { h_flex, v_flex, InputState, Checkbox, v_virtual_list, Scrollbar } from 'gpui-base';
import { settings, pickFolder, setShared, shared, focused, closeOverlay } from 'herdr';
import { git, selections, revision, invalidate, sourceTheme, button, input, message, dialog, openDiscard, action, closeSourceDiff, showSourceTerminals } from './ui.js';
import { diffRows, wrapRows } from './diff.js';
import { languageFor } from './highlight.js';
import { Graph } from './graph/graph.js';

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
    const current = selections()[this.props.spaceKey];
    setShared('source.spaces', { ...selections(), [this.props.spaceKey]: {
      ...current, cwd: current?.cwd ?? this.props.cwd, on: this.props.on, initializing: false, explicit: true, error: null,
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
          .on_change((checked, cx) => { if (checked) this.selected.add(repo.key); else this.selected.delete(repo.key); cx.notify(); })
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
    return dialog(`Repositories for space ${this.props.name}`, null, body, footer, this.props.overlay).h_full();
  }

  close() { this.search.release(); this.path.release(); }
}

export class MainDiff {
  init(_props, cx) { this.diff = null; this.targetId = null; this.graph = null; this.handle = cx.focus_handle(); }

  render(cx) {
    const graphTarget = shared('source.graph'), target = graphTarget ?? shared('source.diff'), focus = focused();
    if (!target || (focus?.space && focus?.tab && (focus.space !== target.space || focus.tab !== target.tab))) {
      this.graph?.close(); this.graph = null;
      showSourceTerminals();
      return div().size_full().bg(sourceTheme().background);
    }
    if (graphTarget) {
      if (this.graph?.targetId !== target.id) {
        this.graph?.close();
        this.graph = new Graph();
        this.graph.init(cx, { folder: target.repo.root, on: target.repo.on, targetId: target.id, handle: this.handle });
      }
      return this.graph.render(cx);
    }
    this.graph?.close(); this.graph = null;
    if (this.targetId !== target.id) {
      const previous = this.diff;
      this.targetId = target.id;
      this.diff = new Diff();
      this.diff.init({ ...target, embedded: true }, cx);
      if (previous) { this.diff.width = previous.width; this.diff.mode = previous.mode; }
    }
    return this.diff.render(cx);
  }

  close() { this.graph?.close(); }
}

export class Diff {
  init(props, cx) {
    this.props = props; this.mode = 'split'; this.rows = { unified: [], split: [] }; this.width = 1000;
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
        this.rows = diffRows(diff.patch, languageFor(path)); this.binary = diff.binary; this.empty = diff.empty;
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

  // Syntax-colored text; changed words inside a paired line get a stronger tint.
  code(line, kind) {
    const t = sourceTheme(), emphasis = kind === 'added' ? t.diff_added_emphasis : t.diff_removed_emphasis;
    return h_flex().flex_1().min_w(0).h_full().items_center().overflow_hidden().pr(16).children(line.segments.map(part => div().flex_none().whitespace_nowrap().text_color(t.syntax[part.kind] ?? t.syntax.plain)
      .when(Boolean(part.emphasis), s => s.bg(emphasis).rounded(2)).child(part.text)));
  }

  gutter(number, kind, width) {
    const t = sourceTheme();
    return div().w(width).h_full().flex_none().flex().items_center().justify_end().pr(10)
      .bg(kind === 'added' ? t.diff_added_gutter : kind === 'removed' ? t.diff_removed_gutter : t.background)
      .text_color(kind === 'added' ? t.git_added : kind === 'removed' ? t.git_deleted : t.disabled)
      .child(number === undefined ? '' : String(number));
  }

  sign(kind, continuation) {
    const t = sourceTheme();
    if (continuation) return div().w(18).h_full().flex_none();
    return div().w(18).h_full().flex_none().flex().items_center().justify_center()
      .text_color(kind === 'added' ? t.git_added : kind === 'removed' ? t.git_deleted : t.disabled)
      .child(kind === 'added' ? '+' : kind === 'removed' ? '−' : '');
  }

  cell(line, width) {
    const t = sourceTheme();
    if (!line) return div().w(width).h(22).flex_none().bg(t.diff_filler);
    const kind = line.kind ?? 'same';
    return h_flex().w(width).h(22).flex_none()
      .bg(kind === 'added' ? t.diff_added_background : kind === 'removed' ? t.diff_removed_background : t.background)
      .child(this.gutter(line.number, kind, 56)).child(this.sign(kind, line.continuation)).child(this.code(line, kind));
  }

  row(row, halfWidth, fullWidth) {
    const t = sourceTheme();
    if (row.kind === 'note') return h_flex().h(22).w(fullWidth).items_center().pl(74).bg(t.background).text_color(t.muted).child(row.text.replace(/^\\\s*/, ''));
    if (row.kind === 'hunk') return h_flex().h(22).w(fullWidth).items_center().bg(t.diff_hunk_background).text_color(t.diff_hunk)
      .child(div().w(this.mode === 'split' ? 74 : 98).flex_none().h_full().bg(t.diff_hunk_background))
      .child(div().flex_none().whitespace_nowrap().pl(8).child(row.range ?? row.text))
      .when(Boolean(row.context), el => el.child(div().flex_none().whitespace_nowrap().pl(12).text_color(t.muted).child(row.context)));
    if (this.mode === 'split') return h_flex().w(fullWidth).h(22).child(this.cell(row.left, halfWidth)).child(this.cell(row.right, halfWidth).border_l(1).border_color(t.border));
    return h_flex().w(fullWidth).h(22)
      .bg(row.kind === 'added' ? t.diff_added_background : row.kind === 'removed' ? t.diff_removed_background : t.background)
      .child(this.gutter(row.old, row.kind, 48)).child(this.gutter(row.next, row.kind, 50))
      .child(this.sign(row.kind, row.continuation)).child(this.code(row, row.kind));
  }

  render(cx) {
    if (this.seenRevision !== revision()) { this.seenRevision = revision(); this.load(cx); }
    const t = sourceTheme(), { repo, path, group, overlay } = this.props, staged = group === 'staged';
    // Like GitHub's split view and delta's side-by-side, the diff fits the view and
    // long lines wrap, so neither mode scrolls sideways.
    const fullWidth = Math.max(0, this.width - 2), halfWidth = Math.floor(fullWidth / 2);
    const columns = Math.floor(((this.mode === 'split' ? halfWidth - 74 : fullWidth - 116) - 22) / (this.charWidth ?? 7.2));
    const source = this.rows[this.mode === 'split' ? 'split' : 'unified'];
    if (this.wrapped?.source !== source || this.wrapped.columns !== columns || this.wrapped.mode !== this.mode) {
      this.wrapped = { source, columns, mode: this.mode, rows: wrapRows(source, this.mode, columns) };
    }
    const rows = this.wrapped.rows;
    const disabled = Boolean(this.busy || this.loading || this.error);
    const segment = (id, label, value) => button(id, label, cx => { this.mode = value; cx.notify(); }, { ghost: true }).h(24).rounded(4)
      .bg(this.mode === value ? t.surface : t.canvas).text_color(this.mode === value ? t.foreground : t.muted);
    const stats = !this.rows.added && !this.rows.removed ? null : h_flex().gap(8).text_size(11).font_family(settings().font_family ?? 'JetBrains Mono')
      .child(div().text_color(t.git_added).child(`+${this.rows.added}`))
      .child(div().text_color(t.git_deleted).child(`−${this.rows.removed}`));
    const modes = h_flex().gap(12).items_center()
      .child(h_flex().p(2).gap(2).rounded(6).bg(t.canvas).border_1().border_color(t.border)
        .child(segment('source-diff-split', 'Side by side', 'split'))
        .child(segment('source-diff-unified', 'Unified', 'unified')))
      .when(Boolean(stats), el => el.child(stats));
    const controls = h_flex().gap(7).items_center()
      .child(button('source-diff-refresh', 'Refresh', cx => this.load(cx), { disabled: Boolean(this.busy || this.loading) }))
      .when(!staged, el => el.child(button('source-diff-discard', 'Discard…', () => openDiscard(repo, path), { disabled, danger: true })))
      .child(button('source-diff-stage', this.busy || (staged ? 'Unstage file' : 'Stage file'), cx => this.mutate(cx), { disabled, primary: true }));
    const toolbar = v_flex().px(18).py(10).gap(7).border_b(1).border_color(t.border)
      .when(this.width < 470, el => el.child(modes).child(controls))
      .when(this.width >= 470, el => el.child(h_flex().gap(7).items_center().child(modes).child(div().flex_1()).child(controls)));
    const labels = h_flex().bg(t.chrome).border_b(1).border_color(t.border).text_size(10).text_color(t.muted)
      .when(this.mode === 'split', el => el
        .child(div().flex_1().px(18).py(9).child(staged ? 'HEAD · last commit' : 'INDEX · staged version'))
        .child(div().flex_1().px(18).py(9).border_l(1).border_color(t.border).child(staged ? 'INDEX · staged version' : 'WORKING TREE · on disk')))
      .when(this.mode === 'unified', el => el.child(div().px(18).py(9).child(staged ? 'HEAD → INDEX' : 'INDEX → WORKING TREE')));
    const content = v_flex().flex_1().min_h(0).child(toolbar)
      .child(div().flex_1().min_h(0).relative().bg(t.background).font_family(settings().font_family ?? 'JetBrains Mono').text_size(12)
        .child(v_flex().size_full().overflow_hidden().child(labels).child(v_virtual_list(`source-diff-${this.mode}`, rows.length, 22, index => `${this.mode}-${index}`,
          range => rows.slice(range.start, range.end).map(row => this.row(row, halfWidth, fullWidth))).flex_1().min_h(0)))
        // Measures the code font so wrapping matches what is drawn.
        .child(div().id('source-diff-measure').absolute().top(0).left(0).opacity(0).whitespace_nowrap().child('0'.repeat(100))
          .on_size_change((size, cx) => { const width = size.width / 100; if (width > 0 && Math.abs(width - (this.charWidth ?? 0)) > 0.01) { this.charWidth = width; cx.notify(); } }))        .child(Scrollbar.vertical(`source-diff-${this.mode}`).viewport_from_layout().absolute().inset_0())
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
