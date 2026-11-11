// Goblin Keep: the King's corner (right side). The King's half-head at the bottom (stand-in art, back view)
// and, at the top, the pit button: cast the goblin in front into the pit (always confirms first).
import { View, div, image } from "gpui-kit";
import { v_flex } from "gpui-base";
import { rightOfKing } from "./layout-util.js";
import { layout, agents, appHome, focused, openOverlay, readTextFile, settings, setShared, shared, terminals } from "herdr";
const KING_W = 288, KING_H = 432; // king-closeup.png: over-the-shoulder close-up (Ryan pick 2026-11-09, Documents/GoblinKing/king/closeup/k3), cleaned + torchlit
const KING_OVER = 40;              // art px he spills past the window edge

const GOLD = "#bca251", INK = "#071410", BLOOD = "#7c2038", TEXT = "#e6dcbe";

export default class KingCorner extends View {
  init(_p, cx) {
    this.size = { width: 220, height: 800 };
    this.torches = {};   // animated torch flames, hall px boxes (goblin-court/art/torch, Documents/GoblinKing/room/torches)
    readTextFile(appHome() + "/mods/goblin-court/art/torch/torches.json").then((t) => { this.torches = JSON.parse(t); cx.notify(); }).catch(() => {});
  }

  // The focused pane's own goblin (not a runt shown in its place).
  petitioner() {
    const f = focused();
    const terms = terminals();
    const isRunt = (addr) => terms.some((x) => x.address === addr && (x?.parent?.address ?? x?.parent));
    const list = agents();
    // Only the selected tab's own goblin. Never focused().agent: when the tab's terminal isn't a reporting
    // agent yet (a shell, a Claude on its trust prompt) that names some other agent, and the pit took the wrong one.
    return list.find((a) => f?.pane && a.pane === f.pane && a.tab === f.tab && !isRunt(a.address))
      ?? list.find((a) => f?.terminal && a.address === f.terminal && a.tab === f.tab);
  }

  askPit() {
    const me = this.petitioner();
    if (!me) return;
    const runts = terminals().filter((x) => (x?.parent?.address ?? x?.parent) === me.address && x.state !== "finished").length;
    openOverlay({ mod: "goblin-pit-confirm", kind: "dialog", modal: true, frame: "none", width: 442, height: 252,
      props: { address: me.address, tab: me.tab, name: me.tab_name || me.address, runts } });
  }

  // Torch flames over the hall's own, where they fall in this column. The hall covers the window (goblin-court
  // shares its placement as "goblin.cover"); this column ends PAD from the window's right edge, below the tabs.
  torchEls(W) {
    const c = shared("goblin.cover");
    if (!c) return [];
    const PAD = 8, TABS = 42, x0 = c.winW - PAD - rightOfKing(layout()) - W, y0 = TABS + PAD, ox = c.offXk ?? c.offX;
    // The hall itself is the layout background; only its torch flames are drawn here.
    return [...Object.entries(this.torches).map(([k, b]) => ({ k, x: ox + b.x * c.s - x0, y: c.offY + b.y * c.s - y0, w: b.w * c.s, h: b.h * c.s }))
      .filter((b) => b.x + b.w > 0 && b.x < W)
      .map((b) => image(`mods/goblin-court/art/torch/${this.torches[b.k].f ?? b.k + ".gif"}`).absolute().left(b.x).top(b.y).w(b.w).h(b.h))];
  }

  render(_cx) {
    const z = settings().zoom || 1;
    const W = this.size.width / z;
    // The Goblin King from behind on his scrap throne (PixelLab, Documents/GoblinKing/king/cand1.png, cropped, x4):
    // drawn wider than the column so the window edge cuts him off and he feels huge.
    const px = Number(shared("goblin.px")) || 1.25;       // the room's pixel scale (set by goblin-court)
    const w = Math.round(KING_W * px), h = Math.round(KING_H * px);
    const me = this.petitioner();
    // "Into the pit": a goblin-made plaque (Documents/GoblinKing/ui, PixelLab, cleaned) at the room's pixel size,
    // warmer on hover; dim and inert when nobody is in front of the King.
    const PW = Math.round(126 * px), PH = Math.round(53 * px);
    const hot = !!me && this.pitHover;
    const pitBtn = div().id("pit-btn").relative().mt(8).ml(Math.max(0, Math.round((W - PW) / 2))).w(PW).h(PH)
      .opacity(me ? 1 : 0.45)
      .when(!!me, (el) => el.cursor_pointer().on_click(() => this.askPit())
        .on_hover((h, cx) => { this.pitHover = h; cx.notify(); }))
      .child(image(`mods/goblin-court/art/ui/pit-plaque${hot ? "-hover" : ""}.png`).absolute().left(0).top(0).w(PW).h(PH))
      // the text sits in the plaque's dark inset (about 27%..83% across, 22%..78% down)
      .child(div().absolute().left(Math.round(PW * 0.27)).top(Math.round(PH * 0.22)).w(Math.round(PW * 0.56)).h(Math.round(PH * 0.56))
        .flex().items_center().justify_center()
        .child(div().text_size(13).font_semibold().text_color(hot ? "#f0c060" : "#e6dcbe").child("Into the pit")));
    return v_flex().id("root").size_full().justify_between().overflow_hidden()
      .on_size_change((size, cx) => {
        this.size = size;
        // The court needs this column's width to lay overlays over the terminal.
        const w = Math.round(size.width / (settings().zoom || 1));
        if (shared("goblin.kingW") !== w) setShared("goblin.kingW", w);
        cx.notify();
      })
      .children(this.torchEls(W))
      .child(pitBtn)
      .child(div().relative().w(W).h(h).child(image("mods/goblin-court/art/king-closeup.png").absolute().left(Math.round(W - w + KING_OVER * px)).top(0).w(w).h(h)))
  }
}
