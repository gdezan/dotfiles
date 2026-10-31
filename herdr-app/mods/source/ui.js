import { div, svg } from 'gpui-kit';
import { Button, Input, h_flex, v_flex } from 'gpui-base';
import { exec, readTextFile, theme, window, shared, setShared, focused, layout, run, openOverlay, closeOverlay, notify } from 'herdr';
import { GitSource } from './git.js';

// Mapped from gdezan-material 0.6.0; this palette is local to Source.
export function sourceTheme() {
  return { ...theme(),
    background: '#1A1A1F', canvas: '#15151A', chrome: '#18181D', surface: '#2F2F34',
    raised: '#2F2F34', hover: '#232429', selected: '#2F2F32', border: '#232327', input: '#28282B',
    foreground: '#C7D6D6', muted: '#848484', dim: '#848484', disabled: '#616161',
    accent: '#80CBC4', solid: '#245753', solid_hover: '#2C6660', solid_foreground: '#C7D6D6',
    ansi1: '#DB373E', ansi2: '#C3E88D', blocked: '#FFCB6B',
    git_added: '#00C8FF', git_modified: '#FC8B49', git_deleted: '#FF0000',
    diff_added_background: '#00C8FF12', diff_removed_background: '#FF000012',
  };
}

export const git = new GitSource(exec, readTextFile, window()?.platform);
export const selections = () => shared('source.tabs') ?? {};
export const revision = () => shared('source.revision');
export const invalidate = () => setShared('source.revision', `${Date.now()}-${Math.random()}`);

export function button(id, label, action, { disabled = false, primary = false, danger = false, ghost = false, tooltip = label } = {}) {
  const t = sourceTheme();
  return Button.new(id).h(28).px(8).flex_none().flex().items_center().justify_center().rounded(5).text_size(11)
    .disabled(disabled).accessibility_label(tooltip).tooltip(tooltip)
    .bg(ghost ? t.chrome : disabled ? t.raised : primary ? t.solid : t.surface)
    .text_color(disabled ? t.disabled : primary ? t.solid_foreground : danger ? t.ansi1 : t.muted)
    .when(!disabled, el => el.hover(s => s.bg(primary ? t.solid_hover : t.hover)))
    .on_mouse_down('left', (_e, cx) => cx.stop_propagation())
    .on_click((event, cx) => { cx.stop_propagation(); if (!disabled) action(cx); }).child(label);
}

export function input(id, state, label, { focused = false } = {}) {
  const t = sourceTheme();
  return div().id(id).h(34).flex().items_center().px(10).rounded(5).bg(t.canvas).border_1().border_color(focused ? t.accent : t.input)
    .on_mouse_down('left', (_e, cx) => cx.stop_propagation())
    .child(Input.new(state).h_full().w_full().text_size(12).text_color(t.foreground).accessibility_label(label));
}

export function message(text, color) {
  return div().px(14).py(10).text_size(12).text_color(color ?? sourceTheme().muted).child(text);
}

export function dialog(title, subtitle, body, footer, overlay, height, onClose) {
  const t = sourceTheme();
  return v_flex().w_full().when(Boolean(height), el => el.h(height)).min_h(0).overflow_hidden().bg(t.chrome).text_color(t.foreground).text_size(13)
    .child(h_flex().px(18).py(13).gap(12).items_center().border_b(1).border_color(t.border)
      .child(v_flex().flex_1().min_w(0).gap(4).child(div().font_semibold().truncate().child(title))
        .when(Boolean(subtitle), el => el.child(div().text_size(11).text_color(t.muted).truncate().tooltip(subtitle).child(subtitle))))
      .child(button('source-dialog-close', '', () => onClose ? onClose() : closeOverlay(overlay), { ghost: true, tooltip: 'Close' }).w(28).px(0)
        .child(svg('mods/source/close.svg').size(18).text_color(t.muted))))
    .child(body)
    .when(Boolean(footer), el => el.child(footer));
}

function sourceMainStack(node = layout()) {
  if (!node || typeof node !== 'object') return null;
  if (node.id === 'main-view' && node.type === 'stack' && node.children?.some(child => child.id === 'main') && node.children?.some(child => child.id === 'source-diff-main' && child.content?.mod === 'source')) return node;
  for (const child of node.children ?? []) {
    const found = sourceMainStack(child);
    if (found) return found;
  }
  return null;
}

export function currentSourceDiff() {
  const target = shared('source.diff'), focus = focused();
  return sourceMainStack()?.active === 'source-diff-main' && target?.space === focus?.space && target?.tab === focus?.tab ? target : null;
}

export function showSourceTerminals() {
  if (sourceMainStack()?.active === 'source-diff-main') run('layout.select', { stack: 'main-view', child: 'main' });
}

export function closeSourceDiff(id) {
  const current = shared('source.diff');
  if (id && current?.id !== id) return;
  if (current) setShared('source.diff', null);
  showSourceTerminals();
}

export function openDiff(repo, file, group) {
  const focus = focused();
  if (focus?.space && focus?.tab && sourceMainStack()) {
    setShared('source.diff', { id: `${Date.now()}-${Math.random()}`, space: focus.space, tab: focus.tab, repo, path: file.path, group });
    run('layout.select', { stack: 'main-view', child: 'source-diff-main' });
  } else {
    // Other layouts without a Source main view keep the existing dialog.
    openOverlay({ mod: 'source', kind: 'dialog', modal: true, width: .92, height: .86, props: { view: 'diff', repo, path: file.path, group } });
  }
}

export function openDiscard(repo, path) {
  openOverlay({ mod: 'source', kind: 'dialog', modal: true, width: 530, props: { view: 'discard', repo, path } });
}

export function action(owner, repo, label, work, cx, done) {
  if (owner.busy) return;
  owner.busy = label; owner.error = null;
  cx.notify();
  cx.spawn(async cx => {
    let succeeded = false;
    try {
      await work();
      succeeded = true;
      notify({ title: `${repo.name}: ${label}`, level: 'success', timeout: 3500 });
    } catch (error) {
      owner.error = String(error);
      notify({ title: `${repo.name}: ${label} failed`, body: String(error), level: 'error', timeout: 10000 });
    } finally {
      owner.busy = null; invalidate(); cx.notify();
    }
    if (succeeded) done?.(cx);
  });
}
