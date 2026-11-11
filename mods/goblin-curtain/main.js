// Goblin Keep: the dialogue box "opening" (Ryan's idea: borderless, same background as the room).
// A borderless popup laid exactly over the terminal. It shows the room background, lined up with the
// layout's own background, so the terminal's spot looks like empty room. A dialogue box then unrolls
// from a thin gold line along its top; when it is full size the popup closes and the real terminal,
// in exactly the same place, is what's left. The box unrolls from the top down.
// props: { w, h, x, y, winW, winH, bg, bgW, bgH, hold, open, terminal } (logical px / ms).
import { View, div, image } from "gpui-kit";
import { closeOverlay, props, run } from "herdr";

const PAGE = "mods/goblin-court/art/hall/torn-page.png"; // = the terminal block background in layouts/goblin-cutscene.json

export default class GoblinCurtain extends View {
  init(_p, cx) {
    const p = props() || {};
    this.p = p;
    this.hold = p.hold ?? 600; this.open = p.open ?? 450;
    this.opened = false;
    const start = Date.now();
    this.key = start;
    let done = false;
    cx.timer.every(30, (cx) => {
      if (done) return;
      const t = Date.now() - start;
      if (!this.opened && t >= this.hold) { this.opened = true; cx.notify(); }
      if (t >= this.hold + this.open + 60) {
        done = true;
        closeOverlay(p.overlay);
        if (p.terminal) run("pane.focus", { terminal: p.terminal });
      }
    });
  }

  render(_cx) {
    const { w = 600, h = 800, x = 0, y = 0, winW = 1000, winH = 1000, bg, bgW = 820, bgH = 720 } = this.p;
    // The layout background is "cover"-fit to the whole window; draw the same crop here.
    const s = Math.max(winW / bgW, winH / bgH);
    const dw = bgW * s, dh = bgH * s;
    const offX = (winW - dw) / 2 - x, offY = (winH - dh) / 2 - y;
    const o = this.opened;
    // The page exactly as the terminal block draws it (cover fit, centred), so when this closes nothing moves.
    const PW = 312, PH = 528, ps = Math.max(w / PW, h / PH), pw = PW * ps, ph = PH * ps;
    const tr = { duration: this.open, easing: "ease-out" };
    return div().id("root").relative().w(w).h(h).overflow_hidden()
      .when(!!bg, (el) => el.child(image(bg).absolute().left(offX).top(offY).w(dw).h(dh)))
      // The dialogue box: a thin gold line along the top that unrolls downward to full height.
      // The torn page (the terminal block's background) unrolls downward from a thin strip.
      // The page slides down from above the top (torn bottom edge leading) to exactly where the terminal draws it.
      // A unique id per curtain: Herdr keeps an element's last animated position by id, so a shared id made a new
      // curtain start from where the previous one ended (Ryan: "starts half open" when switching spaces).
      // Closed = the page's bottom (torn) edge just above the top: the page is cover-fit, so taller than the box, and
      // moving the box up by only h left the page's bottom hanging into view (Ryan: "a stub of it still visible").
      .child(div().id(`box-${this.key}`).absolute().left(0).top(o ? 0 : -Math.ceil((h + ph) / 2) - 2).w(w).h(h).transition("top", tr)
        .child(image(PAGE).absolute().left((w - pw) / 2).top((h - ph) / 2).w(pw).h(ph)));
  }
}
