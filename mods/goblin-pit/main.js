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
const BASE_X = [600, 770];
const COL = 194;                                    // the forearm column that stretches (pit/arm-f[-grip]-col.png)                          // the base stays inside the opening
// Timeline (ms from t0). Ryan: smooth and dynamic, the claw must look like it picks the goblin up. One painted reach
// pose (arm-f) shoots out of the hole ALONG ITS OWN LENGTH to the goblin, the claw closes (arm-f-grip), and it slides
// back the same way dragging him, then both drop into the hole. Positions are computed every tick (no pose swaps
// mid-flight), and the goblin is drawn between the arm and its lower talons (arm-f-grip-front), so he's held.
const T = { roll: [30, 520], strike: [580, 880], grip: 880, lift: [880, 1010], yank: [1170, 1580], sink: [1580, 1970],
  close: 2000,             // the tab closes; the next goblin walks up under the still-open hall
  unroll: [2950, 3550] };  // then the page slides back down over the new terminal, and the scene ends
const END = 3600;
const SINK = 200;                                   // hall px the claw and goblin drop into the hole
const ease = { out: (u) => 1 - (1 - u) ** 3, in: (u) => u ** 3, inOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
const prog = (el, [a, b], f = ease.inOut) => f(Math.min(1, Math.max(0, (el - a) / (b - a))));

export default class GoblinPit extends View {
  init(_p, cx) {
    this.p = props() || {};
    this.phase = 0;
    const t0 = this.p.t0 || Date.now();
    let done = false;
    cx.timer.every(30, (cx) => {
      if (done) return;
      const el = Date.now() - t0;
      this.el = el;
      cx.notify();   // every tick: the scene is a continuous motion
      if (this.p.main && !this.closed && el >= T.close) {
        this.closed = true;
        // The court skips its own curtain for the walk-up this causes: this scene rolls the page back down.
        setShared("goblin.pitAfter", Date.now() + (END - T.close) + 300);
        if (this.p.tab) run("tab.close", { id: this.p.tab, confirmed: true });   // first, so the court never redraws him
        const req = shared("goblin.pit");
        if (req && req.t === this.p.req) setShared("goblin.pit", null);
      }
      if (el >= END) {
        done = true;
        closeOverlay(this.p.overlay);
      }
    });
  }

  render(_cx) {
    const { region, cover, term, victim, bg, bgW = 1152, bgH = 896, arm = {} } = this.p;
    if (!region || !cover || !victim || !arm.f) return div();
    const { s, offX, offY } = cover;
    const rx = region.x, ry = region.y, el = this.el ?? 0;
    const X = (hx) => offX + hx * s - rx, Y = (hy) => offY + hy * s - ry;   // hall px -> this popup's px
    const at = (e, x, y, w, h) => e.absolute().left(Math.round(x)).top(Math.round(y)).w(Math.round(w)).h(Math.round(h));
    const kids = [];
    // Only what changes is drawn: the live court, queue, tags, nameplate and King show through around it.
    // Inside the terminal's rectangle: the hall (as the layout draws it), revealed as the page rolls up.
    const clipT = (child) => at(div(), term.x - rx, term.y - ry, term.w, term.h).overflow_hidden().child(child);
    if (term) kids.push(clipT(at(image(bg), (cover.wideX ?? offX) - term.x, offY - term.y, bgW * s, bgH * s)));

    // The arm: one painted reach (arm-f) whose forearm stretches (column COL repeated, tilted) as far as needed so
    // the palm lands exactly on the goblin's chest wherever he stands, while its root stays in the hole (Ryan's
    // "super long arm"; a fixed-length arm fell short and the goblin jumped to it). Hall px throughout.
    const F = arm.f, G = arm["f-grip"];
    const cH = { x: (victim.x + victim.w * 0.5 - offX) / s, y: (victim.y + victim.h * 0.52 - offY) / s };   // chest
    const reach = F.base[0] - F.palm[0];
    const bx = Math.min(BASE_X[1], Math.max(BASE_X[0], cH.x + reach));
    const n = Math.max(0, bx - cH.x - reach);                          // extra forearm length
    const dy = Math.max(-0.6 * n, Math.min(0.6 * n, BASE_Y - F.base[1] + F.palm[1] - cH.y));   // its tilt
    const O1 = { x: bx - F.base[0] - n, y: BASE_Y - F.base[1] - dy };  // the art's top-left at full reach
    const axis = { x: F.base[0] + n - F.palm[0], y: F.base[1] + dy - F.palm[1] };   // palm -> root
    const out = el < T.yank[0] ? prog(el, T.strike, ease.out) : 1 - prog(el, T.yank, ease.inOut);
    const drop = prog(el, T.sink, ease.in) * SINK;
    const O = { x: O1.x + axis.x * (1 - out), y: O1.y + axis.y * (1 - out) + drop };
    const gripped = el >= T.grip;
    const P = gripped ? G : F;
    const palm = { x: X(O.x + P.palm[0]), y: Y(O.y + P.palm[1]) };
    const showArm = el >= T.strike[0];
    const clipR = X(bx) + 6 * s;                                      // past the root = inside the hole
    const name = gripped ? "arm-f-grip" : "arm-f";
    const armEls = () => {
      const els = [at(image(PIT + `${name}-claw.png`), X(O.x), Y(O.y), F.w * s, F.h * s)];
      // Images keep their proportions in Herdr, so the stretch is laid as 4 px strips (the column x4), each one
      // nudged for the tilt; the rest of the arm is drawn after and covers the last strip's overhang.
      for (let k = 0; k * 4 < n; k++)
        els.push(at(image(PIT + `${name}-col4.png`), X(O.x + COL + k * 4), Y(O.y + (dy * k * 4) / n), 4 * s + 1, F.h * s));
      els.push(at(image(PIT + `${name}-rest.png`), X(O.x + n), Y(O.y + dy), F.w * s, F.h * s));
      return els;
    };
    const clipArm = (els) => div().absolute().left(0).top(0).w(Math.max(0, Math.round(clipR))).h(region.h).overflow_hidden().children(els);

    // The goblin: flails where he stands; once gripped he's drawn into the palm, then follows it exactly.
    const vArt = victim.art.replace(/-idle\.gif$/, "-blocked.gif");
    const home = { x: victim.x - rx, y: victim.y - ry };
    const inPalm = { x: palm.x - victim.w * 0.5, y: palm.y - victim.h * 0.52 };
    const k = gripped ? prog(el, T.lift, ease.out) : 0;
    const shake = gripped && el < T.yank[0] ? Math.sin(el / 22) * 2 * s : 0;   // he struggles in the grip
    const v = { x: home.x + (inPalm.x - home.x) * k + shake, y: home.y + (inPalm.y - home.y) * k };

    if (showArm && el < T.close) kids.push(clipArm(armEls()));
    if (el < T.close) kids.push(at(image(vArt), v.x, v.y, victim.w, victim.h));
    if (showArm && gripped && el < T.close) kids.push(clipArm([at(image(PIT + "arm-f-grip-front.png"), X(O.x), Y(O.y), F.w * s, F.h * s)]));
    // The hole's darkness and near lip over them, inside the terminal's rectangle: what goes down disappears.
    if (term) {
      kids.push(clipT(at(image(PIT + "pit-shade.png"), X(OVER.x) - (term.x - rx), Y(OVER.y) - (term.y - ry), 430 * s, 336 * s)));
      kids.push(clipT(at(image(PIT + "pit-front.png"), X(OVER.x) - (term.x - rx), Y(OVER.y) - (term.y - ry), 430 * s, 336 * s)));
    }
    // The terminal's torn page slides up off the top (its torn bottom edge leading), and at the end slides back
    // down; drawn exactly as the terminal block draws it (cover fit, centred), so start and end match the terminal.
    const up = el < T.unroll[0] ? prog(el, T.roll, ease.in) : 1 - prog(el, T.unroll, ease.out);
    if (term && up < 1) {
      const PW = 312, PHt = 528, ps = Math.max(term.w / PW, term.h / PHt);
      kids.push(clipT(at(image(PAGE), (term.w - PW * ps) / 2, (term.h - PHt * ps) / 2 - term.h * up, PW * ps, PHt * ps)));
    }
    return div().id("root").relative().w(region.w).h(region.h).overflow_hidden().children(kids);
  }
}
