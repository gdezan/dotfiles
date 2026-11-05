import { agents, terminals } from "herdr";

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

export function namer() {
  const term = new Map(terminals().map((terminal) => [terminal.address, terminal]));
  const listed = new Map(agents().map((agent) => [agent.address, agent]));
  return (pane) => {
    const address = pane.address ?? pane.terminal;
    const terminal = term.get(address);
    const agent = listed.get(address);
    if (agent) {
      const isPi = (agent.app ?? terminal?.report?.app ?? agent.program?.key) === "pi";
      const name = isPi ? terminal?.report?.msg : agent.title;
      return name?.trim() || "-";
    }
    const live = clean(pane.title);
    const telling = live && live !== pane.program?.name && live.toLowerCase() !== pane.program?.key
      && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@");
    return terminal?.labels?.["pi.session"] || (telling && live) || pane.program?.name || address || "shell";
  };
}
