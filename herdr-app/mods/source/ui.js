import { div } from 'gpui-kit';
import { Button, Input, h_flex, v_flex } from 'gpui-base';
import { exec, readTextFile, theme, window, shared, setShared, openOverlay, closeOverlay, notify } from 'herdr';
import { GitSource } from './git.js';

export const git = new GitSource(exec, readTextFile, window()?.platform);
export const selections = () => shared('source.tabs') ?? {};
export const revision = () => shared('source.revision');
export const invalidate = () => setShared('source.revision', `${Date.now()}-${Math.random()}`);

export function button(id, label, action, { disabled = false, primary = false, danger = false, tooltip = label } = {}) {
  const t = theme();
  return Button.new(id).h(28).px(8).flex_none().flex().items_center().justify_center().rounded(5).text_size(11)
    .disabled(disabled).accessibility_label(tooltip).tooltip(tooltip)
    .bg(disabled ? t.raised : primary ? t.solid : t.surface)
    .text_color(disabled ? t.dim : primary ? t.solid_foreground : danger ? t.ansi1 : t.muted)
    .when(!disabled, el => el.hover(s => s.bg(primary ? t.solid : t.hover)))
    .on_mouse_down('left', (_e, cx) => cx.stop_propagation())
    .on_click((event, cx) => { cx.stop_propagation(); if (!disabled) action(cx); }).child(label);
}

export function input(id, state, label) {
  const t = theme();
  return div().id(id).h(34).flex().items_center().px(9).rounded(5).bg(t.canvas).border_1().border_color(t.input)
    .on_mouse_down('left', (_e, cx) => cx.stop_propagation())
    .child(Input.new(state).h_full().w_full().text_size(12).text_color(t.foreground).accessibility_label(label));
}

export function message(text, color) {
  return div().px(14).py(10).text_size(12).text_color(color ?? theme().muted).child(text);
}

export function dialog(title, subtitle, body, footer, overlay, height) {
  const t = theme();
  return v_flex().w_full().when(Boolean(height), el => el.h(height)).min_h(0).overflow_hidden().bg(t.chrome).text_color(t.foreground).text_size(13)
    .child(h_flex().px(18).py(13).gap(12).items_center().border_b(1).border_color(t.border)
      .child(v_flex().flex_1().min_w(0).gap(4).child(div().font_semibold().truncate().child(title))
        .when(Boolean(subtitle), el => el.child(div().text_size(11).text_color(t.muted).truncate().tooltip(subtitle).child(subtitle))))
      .child(button('source-dialog-close', '×', () => closeOverlay(overlay), { tooltip: 'Close' })))
    .child(body)
    .when(Boolean(footer), el => el.child(footer));
}

export function openDiff(repo, file, group) {
  openOverlay({ mod: 'source', kind: 'dialog', modal: true, width: .92, height: .86, props: { view: 'diff', repo, path: file.path, group } });
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
