import { View, div, image, svg } from 'gpui-kit';
import { h_flex, v_flex, Input, InputState } from 'gpui-base';
import { appHome, exec, layout, panes, run, spaces, theme } from 'herdr';

const AGENTS = {
  pi: { name: 'Pi', icon: 'icons/pi.svg' },
  claude: { name: 'Claude Code', icon: 'icons/claude.svg' },
  cursor: { name: 'Cursor', icon: 'icons/cursor.svg', tint: true },
};

// Every card carries its own click and hover, so each one costs the script a
// frame: the list stops here and the row under it says how many are left.
const ROW_LIMIT = 300;
const PROJECT_KEY = 'filter.project';

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function visible() {
  const root = layout();
  return !find(root, 'panel')?.hidden && find(root, 'panel-body')?.active === 'sessions';
}

function age(time) {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(time).toLocaleDateString();
}

function project(cwd) {
  if (!cwd) return 'Folder unavailable';
  return cwd.replace(/\/+$/, '').split('/').pop() || cwd;
}

function open(session) {
  if (!session.cwd) return;
  const tabs = panes();
  const matching = spaces().find(space => !space.machine && (space.folder === session.cwd || tabs.some(pane => pane.cwd === session.cwd && space.tabs.some(tab => tab.id === pane.tab))));
  if (matching) {
    run('space.select', { id: matching.id });
    run('tab.new', { space: matching.id, folder: session.cwd, argv: session.argv });
  } else {
    run('space.new', { folder: session.cwd, argv: session.argv });
  }
}

function folderOf(session) {
  return session.cwd ?? '';
}

function matchesSearch(session, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${session.title} ${session.cwd ?? ''}`.toLowerCase().includes(needle);
}

function matchesFolder(session, folder) {
  return folder === null || folderOf(session) === folder;
}

// Folder names clash (Dev/pi-agent-setup and Projects/pi-agent-setup): a name
// only stays a name while it is unique, otherwise the parent folder joins it.
function folderLabels(folders) {
  const byName = new Map();
  for (const folder of folders) {
    const name = project(folder);
    byName.set(name, [...(byName.get(name) ?? []), folder]);
  }
  const labels = new Map();
  for (const [name, same] of byName) {
    for (const folder of same) {
      labels.set(folder, same.length === 1 ? name : folder.replace(/\/+$/, '').split('/').slice(-2).join('/'));
    }
  }
  return labels;
}

// The folders to offer, most sessions first, counted over what the search
// leaves: a folder nobody matched is not worth a row.
function folderCounts(sessions, query, selected) {
  const folders = new Set();
  const counts = new Map();
  for (const session of sessions) {
    const folder = folderOf(session);
    folders.add(folder);
    if (matchesSearch(session, query)) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  // The picked folder keeps its row when the search leaves none of it, so the
  // filter that is on can still be seen and changed.
  if (selected !== null && folders.has(selected)) counts.set(selected, counts.get(selected) ?? 0);
  const labels = folderLabels(folders);
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count, label: labels.get(folder) }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export default class Sessions extends View {
  init(_props, cx) {
    this.state = 'loading';
    this.sessions = [];
    this.errors = [];
    this.loading = false;
    this.loaded = false;
    this.query = '';
    this.foldersOpen = false;
    this.folder = localStorage.getItem(PROJECT_KEY) || null;
    this.focused = false;
    this.input = InputState.new({ placeholder: 'Search title or folder…' });
    this.input.on('change', (_event, cx) => { this.query = this.input.value(); cx.notify(); });
    this.input.on('focus', (_event, cx) => { this.focused = true; cx.notify(); });
    this.input.on('blur', (_event, cx) => { this.focused = false; cx.notify(); });
    this.input.on('submit', () => { const first = this.shown()[0]; if (!this.foldersOpen && first) open(first); });
    cx.timer.every(60000, cx => { if (visible()) this.refresh(cx); });
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async cx => {
      try {
        const result = await exec('node', [`${appHome()}/mods/session-history/read-sessions.mjs`]);
        if (result.code !== 0) throw new Error('Reader failed');
        const data = JSON.parse(result.stdout);
        this.sessions = data.sessions;
        this.errors = data.errors;
        this.state = 'ready';
      } catch {
        this.state = 'error';
      } finally {
        this.loaded = true;
        this.loading = false;
        cx.notify();
      }
    });
  }

  search() {
    return this.query.trim();
  }

  shown() {
    const query = this.search();
    return this.sessions.filter(session => matchesFolder(session, this.folder) && matchesSearch(session, query));
  }

  select(folder) {
    this.folder = folder;
    this.foldersOpen = false;
    if (folder === null) localStorage.removeItem(PROJECT_KEY);
    else localStorage.setItem(PROJECT_KEY, folder);
  }

  clear() {
    this.input.set_value('');
    this.query = '';
    this.select(null);
  }

  render(cx) {
    const t = theme();
    if (visible() && !this.loaded && !this.loading) this.refresh(cx);
    const query = this.search();
    const shown = this.shown();
    const labels = folderLabels(new Set(this.sessions.map(folderOf)));
    const total = this.sessions.filter(session => matchesSearch(session, query)).length;
    const name = this.folder === null ? 'All projects' : labels.get(this.folder) ?? project(this.folder);

    const folderRow = (row) => {
      const current = this.folder === row.folder;
      return h_flex().id(`sessions-folder-${row.folder}`).h(30).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer()
        .when(current, el => el.bg(t.selected))
        .hover(s => s.bg(t.hover))
        .on_click((_event, cx) => { this.select(row.folder); cx.notify(); })
        .child(div().w(10).flex_none().text_size(11).text_color(t.accent).child(current ? '✓' : ''))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(current ? t.foreground : t.muted).child(row.label))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(String(row.count)));
    };

    return v_flex().size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child('Sessions'))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child('This computer'))
        .child(div().id('sessions-refresh').size(28).flex().items_center().justify_center().rounded(6).text_color(t.muted)
          .hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip('Refresh sessions')
          .on_click((_event, cx) => this.refresh(cx)).child(svg('mods/provider-usage/refresh.svg').size(15))))
      .child(v_flex().flex_none().px(10).pt(10).gap(6)
        .child(h_flex().h(30).flex_none().px(9).gap(7).items_center().rounded(8).border_1()
          .border_color(this.focused ? t.accent : t.input).bg(t.background)
          .child(svg('mods/workspace-chrome/search.svg').size(14).flex_none().text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground))
          .when(Boolean(this.query), el => el.child(div().id('sessions-clear-search').size(16).flex().items_center().justify_center().rounded(4)
            .text_size(10).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip('Clear search')
            .on_click((_event, cx) => { this.input.set_value(''); this.query = ''; cx.notify(); }).child('✕'))))
        .child(h_flex().id('sessions-folder').h(28).flex_none().px(9).gap(7).items_center().rounded(8).cursor_pointer()
          .bg(this.foldersOpen ? t.raised : t.surface).border_1().border_color(this.foldersOpen ? t.accent : t.border)
          .hover(s => s.bg(t.hover))
          .on_click((_event, cx) => { this.foldersOpen = !this.foldersOpen; cx.notify(); })
          .child(svg('mods/workspace-chrome/folder.svg').size(13).flex_none().text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(this.folder === null ? t.muted : t.foreground).child(name))
          .child(div().flex_none().text_size(11).text_color(t.dim)
            .child(shown.length === total ? String(total) : `${shown.length} of ${total}`))
          .child(div().flex_none().text_size(9).text_color(t.dim).child(this.foldersOpen ? '▴' : '▾'))))
      .when(this.foldersOpen, el => el.child(div().mx(10).mt(6).flex_1().min_h(0).rounded(8).overflow_hidden().bg(t.surface).border_1().border_color(t.border)
        .child(v_flex().id('sessions-folders').size_full().overflow_y_scrollbar().p(4).gap(1)
          .child(folderRow({ folder: null, label: 'All projects', count: total }))
          .children(folderCounts(this.sessions, query, this.folder).map(folderRow)))))
      .when(!this.foldersOpen, el => el.child(v_flex().id('sessions-list').flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
        .when(!this.loaded, el => el.child(div().p(8).text_color(t.muted).child('Loading sessions…')))
        .when(this.state === 'error', el => el.child(div().p(8).text_color(t.muted).child('Could not load sessions. Try refreshing.')))
        .when(this.state === 'ready' && this.sessions.length === 0, el => el.child(div().p(8).text_color(t.muted).child('No saved sessions found.')))
        .when(this.state === 'ready' && this.sessions.length > 0 && shown.length === 0, el => el.child(v_flex().p(8).gap(8).items_start()
          .child(div().text_color(t.muted).child('No sessions match.'))
          .child(div().id('sessions-clear-filters').h(26).px(9).flex().items_center().rounded(7).bg(t.raised).text_size(12).cursor_pointer()
            .hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_event, cx) => { this.clear(); cx.notify(); }).child('Clear filters'))))
        .when(this.errors.length > 0, el => el.child(div().px(4).py(6).text_size(11).text_color(t.muted).child(this.errors.join(' · '))))
        .children(shown.slice(0, ROW_LIMIT).map((session, index) => {
          const agent = AGENTS[session.agent];
          return v_flex().id(`session-${index}`).w_full().p(12).gap(8).rounded(10).bg(t.surface).border_1().border_color(t.border)
            .when(Boolean(session.cwd), el => el.cursor_pointer().hover(s => s.bg(t.hover)).tooltip(session.cwd).on_click(() => open(session)))
            .child(h_flex().w_full().gap(7).items_center()
              .child(agent.tint ? svg(agent.icon).size(16).flex_none().text_color(t.foreground) : image(agent.icon).size(16).flex_none())
              .child(div().flex_1().min_w(0).text_size(11).text_color(t.muted).truncate().child(agent.name))
              .child(div().text_size(11).text_color(t.dim).child(age(session.modified))))
            .child(div().w_full().min_w(0).font_semibold().truncate().child(session.title))
            .child(h_flex().w_full().gap(8).items_center().text_size(11).text_color(t.muted)
              .child(svg('mods/workspace-chrome/folder.svg').size(13).flex_none())
              .child(div().flex_1().min_w(0).truncate().child(labels.get(folderOf(session)) ?? project(session.cwd)))
              .child(div().text_color(t.dim).child(session.cwd ? 'Open ↗' : 'Cannot open')));
        }))
        .when(shown.length > ROW_LIMIT, el => el.child(div().px(4).py(6).text_size(11).text_color(t.dim)
          .child(`First ${ROW_LIMIT} of ${shown.length} · search or pick a project to narrow`)))));
  }
}
