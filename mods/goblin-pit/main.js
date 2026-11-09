// Goblin Keep: the pit. Ryan: "a monster: the claw reaches all the way across the room on a super long arm,
// grabs the goblin where it stands and pulls it back in."
// One cutscene drawn as a whole scene (room, queue, King, arm, pit lip), so nothing is cut at the layout's block
// edges. Herdr draws overlays only where they are opened, so the court opens this mod as two borderless popups that
// tile the screen below the banners (the court column, and everything right of it from the tab bar down). Both draw
// the SAME scene in window coordinates, each showing its own rectangle of it, on the same clock (t0), so the join
// between them is invisible. The "main" one closes the goblin's tab at the end.
// Sequence: the terminal page rolls up -> the goblin flails where it stands -> the arm bursts out of the pit ->
// reaches across the room -> the claw clenches on the goblin -> yanks it back -> both sink into the hole.
// Art (all at the room's pixel size): mods/goblin-court/art/pit/ (Documents/GoblinKing/hand/arm/build_arm.py: arm
// poses painted by PixelLab from the approved claw; Documents/GoblinKing/room/pitmove/pit_overlays.py: the pit's
// near lip and darkness cut from the hall). The goblin uses its own kit2 GIFs.
// props: { region{x,y,w,h}, main, t0, cover{s,offX,offY}, term{x,y,w,h}, figs[{src,x,y,w,h,z,kind}],
//          king{src,x,y,w,h,clipR}, victim{x,y,w,h,art}, tab, req, bg, bgW, bgH, arm{name:{base,palm,w,h}} }
import { View, div, image } from "gpui-kit";
import { closeOverlay, props, run, setShared, shared } from "herdr";

const PIT = "mods/goblin-court/art/pit/";
const PAGE = "mods/goblin-court/art/hall/torn-page.png";
const OPEN = { x: 715, y: 657, rx: 130, ry: 83 };   // the hole's opening in the hall image (pit_overlays.py OPEN)
const OVER = { x: 500, y: 560 };                    // where pit-front/pit-shade.png sit in the hall image (430x336)
const BASE_Y = 722;                                 // the arm's base row: inside the opening, just above its near lip
const BASE_X = [600, 770];                          // the base stays inside the opening
// Phases: [start ms, arm pose (null = none), victim: "spot" | "palm"]. The arm swaps poses instantly (a strike).
const PH = [
  [0, null, "spot"],          // the page, still down
  [30, null, "spot"],         // the page rolls up
  [520, "e", "spot"],       // bursts out of the pit
  [660, "h", "spot"],         // half way (if painted)
  [780, "f", "spot"],         // full reach
  [1020, "f-grip", "palm"],   // clenches on the goblin
  [1420, "h-grip", "palm"],   // yanks it back (if painted)
  [1540, "e-grip", "palm"],
  [1720, "e-grip", "sink"],   // both sink into the hole
];
const END = 2200;
const SINK = 180;                                   // hall px the arm and goblin drop into the hole

export default class GoblinPit extends View {
  init(_p, cx) {
    this.p = props() || {};
    this.phase = 0;
    const t0 = this.p.t0 || Date.now();
    let done = false;
    cx.timer.every(30, (cx) => {
      if (done) return;
      const el = Date.now() - t0;
      let ph = 0;
      for (let i = 0; i < PH.length; i++) if (el >= PH[i][0]) ph = i;
      this.el = el;
      if (ph !== this.phase || el < 560) { this.phase = ph; cx.notify(); }   // redraw every tick while the page rolls
      if (el >= END) {
        done = true;
        closeOverlay(this.p.overlay);
        if (this.p.main) {
          const req = shared("goblin.pit");
          if (req && req.t === this.p.req) setShared("goblin.pit", null);
          if (this.p.tab) run("tab.close", { id: this.p.tab, confirmed: true });
        }
      }
    });
  }

  render(_cx) {
    const { region, cover, term, figs = [], king, victim, bg, bgW = 1152, bgH = 896, arm = {} } = this.p;
    if (!region || !cover || !victim) return div();
    const { s, offX, offY } = cover;
    const rx = region.x, ry = region.y;
    const X = (hx) => offX + hx * s - rx, Y = (hy) => offY + hy * s - ry;   // hall px -> this popup's px
    const at = (el, x, y, w, h) => el.absolute().left(Math.round(x)).top(Math.round(y)).w(Math.round(w)).h(Math.round(h));
    const [, poseWanted, hold] = PH[this.phase];
    // Poses that weren't painted fall back to their neighbours.
    const pose = poseWanted && (arm[poseWanted] ? poseWanted : poseWanted.replace(/^h/, "e"));
    const kids = [];

    // The room, aligned exactly as the layout background (cover fit to the window).
    kids.push(at(image(bg), (cover.wideX ?? offX) - rx, offY - ry, bgW * s, bgH * s));
    // Everyone else in the hall, back to front, with their floor shadows.
    for (const f of figs) {
      const k = f.kind === "runt" ? { l: 0.27, w: 0.46, t: 0.9 } : { l: 0.31, w: 0.38, t: 0.955 };
      kids.push(div().absolute().left(Math.round(f.x + f.w * k.l - rx)).top(Math.round(f.y + f.h * k.t - ry))
        .w(Math.round(f.w * k.w)).h(Math.max(3, Math.round(f.h * 0.05))).rounded(999).bg("#00000066"));
    }
    for (const f of [...figs].sort((a, b) => a.z - b.z)) kids.push(at(image(f.src), f.x - rx, f.y - ry, f.w, f.h));

    // The arm: its base sits in the hole; it is placed so its full reach lands on the goblin's chest.
    const chest = { x: victim.x + victim.w * 0.5, y: victim.y + victim.h * 0.52 };      // window px
    const F = arm.f;
    let baseHX = OPEN.x;
    if (F) baseHX = Math.min(BASE_X[1], Math.max(BASE_X[0], (chest.x - offX) / s + (F.base[0] - F.palm[0])));
    const sink = hold === "sink" ? SINK : 0;
    // The full reach is placed to land on the goblin; the rearing poses hang their claw over the hole instead, so
    // what the claw holds is pulled back over the opening and goes down into it (not beside it).
    const baseFor = (name, a) => (name[0] === "f" ? baseHX
      : Math.min(BASE_X[1] + 70, OPEN.x - 55 + (a.base[0] - a.palm[0])));
    const armBox = (name) => {
      const a = arm[name];
      return { x: X(baseFor(name, a)) - a.base[0] * s, y: Y(BASE_Y + sink) - a.base[1] * s, w: a.w * s, h: a.h * s, a };
    };
    const tSink = { duration: Math.max(1, END - PH[PH.length - 1][0] - 80), easing: "ease-in" };

    // The goblin: flails where it stands, then hangs in the claw (its chest at the palm).
    const vArt = victim.art.replace(/-idle\.gif$/, "-blocked.gif");
    let vx = victim.x - rx, vy = victim.y - ry;
    if (pose && hold !== "spot") {
      const b = armBox(pose);
      vx = b.x + b.a.palm[0] * s - victim.w * 0.5;
      vy = b.y + b.a.palm[1] * s - victim.h * 0.52;
    }
    const vEl = at(div().id("victim"), vx, vy, victim.w, victim.h)
      .when(hold === "sink", (el) => el.transition("top", tSink))
      .child(image(vArt).absolute().left(0).top(0).size_full());
    kids.push(vEl);
    if (pose) {
      const b = armBox(pose);
      kids.push(at(div().id("arm"), b.x, b.y, b.w, b.h)
        .when(hold === "sink", (el) => el.transition("top", tSink))
        .child(image(PIT + `arm-${pose}.png`).absolute().left(0).top(0).size_full()));
    }
    // The hole's darkness and its near lip, over the arm and the goblin: what goes in, goes down and out of sight.
    kids.push(at(image(PIT + "pit-shade.png"), X(OVER.x), Y(OVER.y), 430 * s, 336 * s));
    kids.push(at(image(PIT + "pit-front.png"), X(OVER.x), Y(OVER.y), 430 * s, 336 * s));
    // The King in front of it all, cut at his column's edge as in the layout.
    // In a wide window king-corner shows the hall's right side (cover.offXk): match it inside his column.
    if (king && cover.offXk != null && king.colX != null && cover.offXk !== offX && king.colX < rx + region.w)
      kids.push(div().absolute().left(Math.round(king.colX - rx)).top(0).w(Math.round(king.clipR - king.colX)).h(region.h).overflow_hidden()
        .child(at(image(bg), cover.offXk - king.colX, offY - ry, bgW * s, bgH * s)));
    if (king) kids.push(div().absolute().left(0).top(0).w(Math.max(0, Math.round(king.clipR - rx))).h(region.h).overflow_hidden()
      .child(at(image(king.src), king.x - rx, king.y - ry, king.w, king.h)));
    // The terminal's torn page rolls up into a strip.
    const roll = Math.min(1, Math.max(0, ((this.el ?? 0) - 30) / 450));
    const pageH = Math.max(0, Math.round(term ? term.h * (1 - roll * roll) : 0));      // ease-in
    if (term && pageH > 0) kids.push(at(div().id("page"), term.x - rx, term.y - ry, term.w, pageH).overflow_hidden()
      .child(image(PAGE).absolute().left(0).top(0).w(term.w).h(term.h)));

    return div().id("root").relative().w(region.w).h(region.h).overflow_hidden().children(kids);
  }
}
