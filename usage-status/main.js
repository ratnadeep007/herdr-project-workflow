import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, exec, appHome } from "herdr";

function detail(name, data) {
  if (!data || data.error) return `${name}: ${data?.error || "Loading usage"}`;
  const line = (label, w) => w ? `${label}: ${Math.round(100 - w.used)}% remaining · resets ${w.reset ? new Date(w.reset * 1000).toLocaleString() : "unknown"}` : `${label}: unavailable`;
  return `${name}\n${line("5-hour", data.five)}\n${line("Weekly", data.week)}\nUpdated: ${new Date(data.updated * 1000).toLocaleTimeString()}${data.note ? `\n${data.note}` : ""}`;
}

export default class UsageStatus extends View {
  init(_props, cx) {
    this.usage = {};
    this.refresh(cx);
    cx.timer.every(300000, cx => this.refresh(cx));
  }
  refresh(cx) {
    cx.spawn(async cx => {
      try {
        const r = await exec("python3", [`${appHome()}/mods/usage-status/usage.py`]);
        this.usage = JSON.parse(r.stdout);
      } catch (_) { this.usage = { codex: {error: "Usage unavailable"}, claude: {error: "Usage unavailable"} }; }
      cx.notify();
    });
  }
  render() {
    const t = theme(), space = spaces().find(s => s.active), list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const pill = (key, name) => {
      const data = this.usage[key], n = data?.five?.used;
      return h_flex().id(`usage-${key}`).items_center().gap(5).px(7).h(21).rounded(10).bg(t.raised)
        .tooltip(detail(name, data)).child(svg(`icons/${key}.svg`).size(13))
        .child(typeof n === "number" ? `${Math.round(100 - n)}%` : "—");
    };
    return h_flex().size_full().px(14).gap(12).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1()).child(pill("claude", "Claude Code")).child(pill("codex", "Codex"))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(`${window()?.platform === "macos" ? "⌘" : "Ctrl"} Shift P`));
  }
}
