import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, exec, layout, readTextFile, spaces, theme } from "herdr";

const READER_FILES = ["package.json", "index.ts", "types.ts", "windows.ts", "cursor.ts", "openai.ts", "claude.ts", "antigravity.ts"];
const PROVIDER_LOGOS = {
  cursor: ["icons/cursor.svg", false],
  openai: ["mods/provider-usage/openai.svg", false], claude: ["mods/provider-usage/claude.svg", true],
  "opencode-go": ["icons/opencode.svg", false], xai: ["icons/grok.svg", false],
  copilot: ["icons/copilot.svg", false], antigravity: ["icons/antigravity.svg", true],
  deepseek: ["mods/provider-usage/deepseek.svg", false],
};
const CHECK_READER = `const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const p=path.join(os.homedir(),'.config','herdr-usage','index.ts');if(!fs.existsSync(p))process.exit(42);import(require('node:url').pathToFileURL(p).href)`;
const INSTALL_PART = `const fs=require('node:fs'),p=require('node:path'),os=require('node:os');const [stage,file,part,first]=process.argv.slice(1);const dir=p.join(os.homedir(),'.config',stage);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(p.join(dir,file),part,{flag:first==='1'?'wx':'a'});`;
const FINISH_INSTALL = `const fs=require('node:fs'),p=require('node:path'),os=require('node:os');const base=p.join(os.homedir(),'.config');fs.renameSync(p.join(base,process.argv[1]),p.join(base,'herdr-usage'));`;
const CLEAN_INSTALL = `require('node:fs').rmSync(require('node:path').join(require('node:os').homedir(),'.config',process.argv[1]),{recursive:true,force:true});`;

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const found = findNode(child, id); if (found) return found; }
  return null;
}
function panelVisible() {
  const root = layout();
  return !findNode(root, "panel")?.hidden && findNode(root, "panel-body")?.active === "usage";
}
function selectedMachine() { return spaces().find(space => space.active)?.machine ?? null; }
function normalizeUsageRows(rows) {
  const codex = rows.find(row => row.id === "codex");
  if (!codex) return rows;
  return rows.filter(row => row.id !== "codex").map(row => {
    if (row.id !== "openai" || !row.error) return row;
    if (codex.snapshot) return { ...row, error: undefined, snapshot: codex.snapshot };
    return codex.error ? { ...row, error: `${row.error}; Codex fallback: ${codex.error}` } : row;
  });
}
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function elapsed(window, now) {
  return window.windowSeconds > 0 && window.resetAt ? clamp((now / 1000 - window.resetAt + window.windowSeconds) / window.windowSeconds) : null;
}
function windowName(window) {
  const seconds = window.windowSeconds;
  if (seconds === 604800) return window.label.startsWith("7d ") ? `Weekly · ${window.label.slice(3)}` : "Weekly";
  if (seconds >= 2419200 && seconds <= 2678400) return "Monthly";
  if (seconds && seconds % 3600 === 0) return `${seconds / 3600}-hour`;
  return window.label;
}
function resetLabel(resetAt, now) {
  if (!resetAt) return "";
  const minutes = Math.floor((resetAt * 1000 - now) / 60000);
  if (minutes < 1) return "Resets soon";
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  if (days >= 7) return `Resets in ${days}d`;
  if (days) return `Resets in ${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours) return `Resets in ${hours}h${mins ? ` ${String(mins).padStart(2, "0")}m` : ""}`;
  return `Resets in ${mins}m`;
}
function updatedLabel(time, now) {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  return minutes < 1 ? "Updated just now" : minutes < 60 ? `Updated ${minutes}m ago` : `Updated ${Math.floor(minutes / 60)}h ago`;
}

export default class ProviderUsage extends View {
  init(_props, cx) {
    this.context = undefined; this.state = "loading"; this.rows = []; this.expanded = false; this.request = 0; this.installing = {};
    cx.timer.every(60000, (cx) => { if (panelVisible()) this.refresh(cx); });
  }
  refresh(cx, force = false) {
    const on = selectedMachine(), key = on ?? "";
    if (this.loading === key && !force) return;
    if (this.context !== key) { this.context = key; this.rows = []; this.state = "loading"; this.error = null; }
    const request = ++this.request;
    this.loading = key;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("node", ["--experimental-strip-types", "--no-warnings", "-e", CHECK_READER], { on });
        if (this.context !== key || this.request !== request) return;
        if (result.code === 42) { this.state = "missing"; this.rows = []; }
        else if (result.code !== 0) { this.state = "error"; this.error = "Could not run the usage reader. Check the installation and try again."; }
        else {
          const report = JSON.parse(result.stdout);
          if (report.version !== 1 || !Array.isArray(report.rows)) throw new Error("Invalid usage report");
          this.rows = normalizeUsageRows(report.rows); this.state = "ready"; this.error = null;
        }
      } catch (error) {
        if (this.context === key && this.request === request) { this.state = "error"; this.error = `Could not read usage: ${String(error)}`; }
      } finally { if (this.request === request) this.loading = null; cx.notify(); }
    });
  }
  install(cx) {
    const on = selectedMachine(), key = on ?? "", stage = `herdr-usage-install-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    if (this.installing[key]) return;
    this.installing[key] = true; this.error = null;
    cx.spawn(async (cx) => {
      try {
        for (const file of READER_FILES) {
          const contents = await readTextFile(`${appHome()}/mods/provider-usage/reader/${file}`);
          if (contents === null) throw new Error(`Missing installer file ${file}`);
          for (let offset = 0; offset < contents.length; offset += 5000) {
            const result = await exec("node", ["-e", INSTALL_PART, stage, file, contents.slice(offset, offset + 5000), offset === 0 ? "1" : "0"], { on });
            if (result.code !== 0) throw new Error("Could not write the usage reader on this machine");
          }
        }
        const result = await exec("node", ["-e", FINISH_INSTALL, stage], { on });
        if (result.code !== 0) throw new Error("Could not finish installing. A usage reader folder may already exist on this machine.");
        if (this.context === key) { this.state = "loading"; this.refresh(cx, true); }
      } catch (error) {
        await exec("node", ["-e", CLEAN_INSTALL, stage], { on }).catch(() => {});
        if (this.context === key) { this.state = "missing"; this.error = String(error); }
      }
      finally { delete this.installing[key]; cx.notify(); }
    });
    cx.notify();
  }
  windowRow(window, index, t, now) {
    const isAmount = typeof window.amount === "number", hasLimit = isAmount && window.limitAmount > 0;
    const used = clamp(hasLimit ? window.amount / window.limitAmount : window.usedPercent / 100);
    const progress = elapsed(window, now);
    const tone = used >= 1 ? t.ansi1 : progress !== null && used > progress ? t.blocked : t.accent;
    const value = isAmount ? (window.currency === "cr" ? `${Math.round(window.amount)}${hasLimit ? ` / ${Math.round(window.limitAmount)}` : ""} credits` : `${window.currency ?? ""} ${window.amount.toFixed(2)}`) : used >= 1 ? "None left" : `${Math.floor(100 - used * 100)}% left`;
    return v_flex().w_full().px(12).py(7).gap(4).border_t(1).border_color(t.border)
      .child(h_flex().w_full().gap(8).items_center().child(div().flex_1().min_w(0).truncate().child(windowName(window))).child(div().text_color(used >= 1 || (progress !== null && used > progress) ? tone : t.foreground).child(value)))
      .when(!isAmount || hasLimit, el => el.child(div().relative().w_full().h(8).rounded(4).bg(t.selected)
        .child(div().absolute().left(0).top(0).h(8).w(`${used * 100}%`).rounded(4).bg(tone))
        .when(progress !== null, bar => bar.child(div().absolute().left(`${Math.min(99, progress * 100)}%`).top(-2).w(2).h(12).bg(t.foreground)))))
      .when(Boolean(window.resetAt), el => el.child(div().text_size(11).text_color(t.muted).child(resetLabel(window.resetAt, now))));
  }
  render(cx) {
    const t = theme(), now = Date.now(), key = selectedMachine() ?? "";
    if (panelVisible() && this.context !== key) this.refresh(cx);
    const reported = this.rows.filter(row => row.snapshot && !row.error), failed = this.rows.filter(row => row.error);
    const button = (id, label, action) => div().id(id).px(10).py(6).rounded(6).bg(t.raised).text_color(t.foreground).hover(s => s.bg(t.hover)).cursor_pointer().on_click(action).child(label);
    return v_flex().id("provider-usage").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Usage")).child(div().flex_1()).child(div().text_size(11).text_color(t.dim).child(selectedMachine() ?? "This computer"))
        .when(this.state === "ready" || this.state === "error", el => el.child(div().id("usage-refresh").size(28).flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip("Refresh usage").on_click((_e, cx) => this.refresh(cx)).child(svg("mods/provider-usage/refresh.svg").size(15)))))
      .child(v_flex().id("usage-content").flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
        .when(this.state === "loading", el => el.child(div().p(8).text_color(t.muted).child("Loading usage…")))
        .when(this.state === "missing", el => el.child(v_flex().p(8).gap(10).items_start().child(div().child("Usage reader is not installed on this machine."))
          .child(div().text_size(11).text_color(t.muted).child("Installs in ~/.config/herdr-usage on this machine. Requires Node.js 22.19 or later. Reads local provider credentials without changing them."))
          .child(button("usage-install", this.installing[key] ? "Installing…" : "Install usage reader", (_e, cx) => this.install(cx)))
          .when(Boolean(this.error), box => box.child(div().text_color(t.ansi1).child(this.error)))))
        .when(this.state === "error", el => el.child(div().p(8).text_color(t.ansi1).child(this.error)))
        .when(this.state === "ready", el => el
          .when(reported.length === 0, list => list.child(div().p(8).text_color(t.muted).child("No subscription usage available")))
          .children(reported.map(row => v_flex().w_full().rounded(12).overflow_hidden().bg(t.surface)
            .child(h_flex().h(42).px(12).gap(9).items_center()
              .child(div().size(28).flex_none().flex().items_center().justify_center()
                .child(PROVIDER_LOGOS[row.id]?.[1] ? image(PROVIDER_LOGOS[row.id][0]).size(20) : svg(PROVIDER_LOGOS[row.id]?.[0] ?? "icons/agent.svg").size(20).text_color(t.foreground)))
              .child(div().flex_1().min_w(0).font_semibold().truncate().child(row.name))
              .child(div().text_size(10).text_color(t.muted).child(updatedLabel(row.snapshot.updatedAt, now))))
            .children(row.snapshot.windows.map((window, i) => this.windowRow(window, i, t, now)))))
          .when(failed.length > 0, list => list.child(v_flex().gap(4)
            .child(div().id("usage-failures").px(4).py(8).text_size(11).text_color(t.muted).cursor_pointer().on_click((_e, cx) => { this.expanded = !this.expanded; cx.notify(); }).child(`Not reporting: ${failed.map(row => row.name).join(", ")} ${this.expanded ? "▴" : "▾"}`))
            .when(this.expanded, box => box.children(failed.map(row => div().px(4).text_size(11).text_color(t.muted).child(`${row.name} · ${row.error}`))))))));
  }
}
