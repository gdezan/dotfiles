import { View, div, image, svg } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { appHome, exec, layout, panes, run, spaces, theme } from 'herdr';

const AGENTS = {
  pi: { name: 'Pi', icon: 'icons/pi.svg' },
  claude: { name: 'Claude Code', icon: 'icons/claude.svg' },
  cursor: { name: 'Cursor', icon: 'icons/cursor.svg', tint: true },
};

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

export default class Sessions extends View {
  init(_props, cx) {
    this.state = 'loading';
    this.sessions = [];
    this.errors = [];
    this.loading = false;
    this.loaded = false;
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

  render(cx) {
    const t = theme();
    if (visible() && !this.loaded && !this.loading) this.refresh(cx);
    return v_flex().size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child('Sessions'))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child('This computer'))
        .child(div().id('sessions-refresh').size(28).flex().items_center().justify_center().rounded(6).text_color(t.muted)
          .hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip('Refresh sessions')
          .on_click((_event, cx) => this.refresh(cx)).child(svg('mods/provider-usage/refresh.svg').size(15))))
      .child(v_flex().id('sessions-list').flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
        .when(!this.loaded, el => el.child(div().p(8).text_color(t.muted).child('Loading sessions…')))
        .when(this.state === 'error', el => el.child(div().p(8).text_color(t.muted).child('Could not load sessions. Try refreshing.')))
        .when(this.state === 'ready' && this.sessions.length === 0, el => el.child(div().p(8).text_color(t.muted).child('No saved sessions found.')))
        .when(this.errors.length > 0, el => el.child(div().px(4).py(6).text_size(11).text_color(t.muted).child(this.errors.join(' · '))))
        .children(this.sessions.map((session, index) => {
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
              .child(div().flex_1().min_w(0).truncate().child(project(session.cwd)))
              .child(div().text_color(t.dim).child(session.cwd ? 'Open ↗' : 'Cannot open')));
        })));
  }
}
