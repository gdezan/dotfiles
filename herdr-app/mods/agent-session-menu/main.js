import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, terminals, run, props, closeOverlay, openOverlay, theme, exec, notify } from "herdr";

export function sessionRenameCommand(terminal) {
  const app = terminal?.report?.app ?? terminal?.program?.key;
  if (app === "pi") return "/name";
  if (app === "claude-code" || app === "claude") return "/rename";
  return null;
}

export function sessionMenuItems(terminal, name) {
  const live = terminal?.state === "live";
  const blocked = terminal?.status === "blocked";
  return [
    { id: "focus", label: "Focus session", icon: "terminal", enabled: live },
    { id: "copy-name", label: "Copy session name", icon: "copy", enabled: Boolean(name && name !== "-") },
    { id: "copy-address", label: "Copy terminal address", icon: "copy", enabled: Boolean(terminal?.address) },
    { id: "rename", label: "Rename session…", icon: "square-pen", enabled: live && !blocked && Boolean(sessionRenameCommand(terminal)), hint: "Available for Pi and Claude Code unless waiting for permission or an answer" },
    { id: "interrupt", label: "Interrupt agent", icon: "square", enabled: live && terminal.status === "working" },
    { id: "stop", label: "Stop session…", icon: "x", enabled: live },
  ];
}

export default class AgentSessionMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.busy = false;
    this.error = "";
    this.handle = cx.focus_handle();
    if (props()?.rename) {
      const name = props().name === "-" ? "" : props().name ?? "";
      this.input = InputState.new({ value: name });
      if (name) this.input.set_selected_range({ start: 0, end: name.length });
      this.input.on("change", (_e, cx) => cx.notify());
      this.input.on("submit", (_e, cx) => this.rename(cx));
      this.input.focus();
      cx.timer.after(600, () => this.input.focus());
    } else this.handle.focus();
  }

  terminal() {
    return terminals().find(terminal => terminal.address === props()?.terminal);
  }

  items() {
    return sessionMenuItems(this.terminal(), props()?.name);
  }

  choose(index, cx) {
    const item = this.items()[index];
    if (!item?.enabled || this.busy) return;
    const p = props();
    if (item.id === "interrupt") {
      this.execute(["interrupt", p.terminal], cx);
      return;
    }
    closeOverlay(p.overlay);
    if (item.id === "copy-name" || item.id === "copy-address") {
      cx.write_to_clipboard(item.id === "copy-name" ? p.name : p.terminal);
    } else if (item.id === "focus") {
      const agent = agents().find(agent => agent.address === p.terminal);
      run(agent ? "agent.focus" : "terminal.peek", { terminal: p.terminal });
    } else if (item.id === "rename") {
      openOverlay({ mod: "agent-session-menu", kind: "dialog", width: 420, height: 220, props: { terminal: p.terminal, name: p.name, rename: true } });
    } else if (item.id === "stop") {
      openOverlay({ mod: "confirm", kind: "dialog", width: 440, height: 210, props: {
        title: "Stop session?",
        detail: `End ${p.name && p.name !== "-" ? `“${p.name}” (${p.terminal})` : p.terminal} and its sub-agents? Running work will be interrupted and its terminal will close.`,
        command: { name: "terminal.kill", args: { terminal: p.terminal } },
      } });
    }
  }

  rename(cx) {
    if (this.busy) return;
    const terminal = this.terminal();
    const command = sessionRenameCommand(terminal);
    const name = this.input.value().trim();
    if (!name || /[\r\n\x00-\x1f\x7f]/.test(name)) {
      this.error = "Enter a session name on one line.";
      cx.notify();
      return;
    }
    if (!command || terminal?.state !== "live" || terminal.status === "blocked") {
      this.error = "This session cannot be renamed while waiting for permission or an answer.";
      cx.notify();
      return;
    }
    const target = props().terminal;
    const [machine, address] = target.includes("/") ? target.split("/") : [null, target];
    // Send on the target core so cross-machine message tags cannot wrap the slash command.
    this.execute(["exec", ...(machine ? ["--on", machine] : []), "hc", "send", address, `${command} ${name}`], cx, command === "/name" ? name : null);
  }

  execute(args, cx, confirmationName = null) {
    this.busy = true;
    this.error = "";
    cx.notify();
    const overlay = props().overlay;
    cx.spawn(async (cx) => {
      let confirmed = false;
      // Pi reports the new name without starting the turn that hc send waits for.
      const confirmation = confirmationName ? cx.timer.every(50, () => {
        if (confirmed || this.terminal()?.report?.msg !== confirmationName) return;
        confirmed = true;
        confirmation.cancel();
        closeOverlay(overlay);
      }) : null;
      try {
        const result = await exec("hc", args);
        if (result.code !== 0) throw new Error(result.stderr?.trim() || result.stdout?.trim() || `hc exited with code ${result.code}`);
        if (!confirmed) closeOverlay(overlay);
      } catch (error) {
        if (!confirmed) {
          this.busy = false;
          this.error = String(error.message ?? error);
          notify({ title: "Session action failed", body: this.error, level: "error" });
          cx.notify();
        }
      } finally {
        confirmation?.cancel();
      }
    });
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    if (p.rename) return this.renderRename(t);
    const list = this.items();
    return v_flex().id("agent-session-menu").track_focus(this.handle).w_full().p(5).bg(t.popover).text_size(12.8)
      .on_key_down((event, cx) => {
        if (event.key === "down" || event.key === "up") {
          const step = event.key === "down" ? 1 : -1;
          for (let offset = 1; offset <= list.length; offset++) {
            const index = (this.at + list.length + step * offset) % list.length;
            if (list[index].enabled) { this.at = index; break; }
          }
        } else if (event.key === "enter") this.choose(this.at, cx);
        else if (event.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(div().px(8).pt(4).pb(6).truncate().text_size(11).text_color(t.dim).child(p.name && p.name !== "-" ? p.name : p.terminal ?? "Session unavailable"))
      .children(list.map((item, index) => v_flex()
        .when(item.id === "rename" || item.id === "stop", el => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`session-${item.id}`).h(31).px(8).gap(9).rounded(7).items_center()
          .text_color(!item.enabled || this.busy ? t.dim : item.id === "stop" ? t.ansi1 : t.foreground)
          .when(item.enabled && !this.busy, el => el.cursor_pointer().when(index === this.at, el => el.bg(t.selected)).hover(el => el.bg(t.hover)))
          .when(Boolean(item.hint) && !item.enabled, el => el.tooltip(item.hint))
          .on_click((_event, cx) => this.choose(index, cx))
          .child(svg(item.icon === "copy" ? "mods/agent-session-menu/copy.svg" : `mods/workspace-chrome/${item.icon}.svg`).size(14).flex_none())
          .child(div().flex_1().child(this.busy && item.id === "interrupt" ? "Interrupting…" : item.label)))))
      .when(Boolean(this.error), el => el.child(div().p(8).text_size(11).text_color(t.ansi1).child(this.error)));
  }

  renderRename(t) {
    const p = props();
    const button = (id, label, action, primary = false) => div().id(id).h(32).px(14).flex().items_center().rounded(8)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .cursor_pointer().hover(el => el.opacity(0.88)).on_click(action).child(label);
    return v_flex().id("rename-agent-session").w_full().p(18).gap(12).bg(t.popover).text_size(12.8).text_color(t.foreground)
      .on_key_down((event, cx) => { if (event.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .child(div().text_size(15).font_semibold().child("Rename session"))
      .child(div().text_size(11.5).text_color(t.dim).child(p.terminal))
      .child(Input.new(this.input).h(36).px(10).rounded(8).border_1().border_color(t.input).bg(t.background))
      .when(Boolean(this.error), el => el.child(div().text_size(11).text_color(t.ansi1).child(this.error)))
      .child(h_flex().justify_end().gap(8)
        .child(button("rename-cancel", "Cancel", () => closeOverlay(p.overlay)))
        .child(button("rename-save", this.busy ? "Saving…" : "Save", (_event, cx) => this.rename(cx), true)));
  }
}
