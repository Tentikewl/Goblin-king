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

    // The arm's final placement: its base in the hole, its palm on the goblin's chest (as far as it reaches).
    const F = arm.f, chest = { x: victim.x + victim.w * 0.5, y: victim.y + victim.h * 0.52 };   // window px
    const baseHX = Math.min(BASE_X[1], Math.max(BASE_X[0], (chest.x - offX) / s + (F.base[0] - F.palm[0])));
    const A1 = { x: X(baseHX) - F.base[0] * s, y: Y(BASE_Y) - F.base[1] * s };
    // Retracted: slid back along the arm so the palm sits at the base (in the hole).
    const A0 = { x: A1.x + (F.base[0] - F.palm[0]) * s, y: A1.y + (F.base[1] - F.palm[1]) * s };
    const out = el < T.yank[0] ? prog(el, T.strike, ease.out) : 1 - prog(el, T.yank, ease.inOut);
    const drop = prog(el, T.sink, ease.in) * SINK * s;
    const A = { x: A0.x + (A1.x - A0.x) * out, y: A0.y + (A1.y - A0.y) * out + drop };
    const gripped = el >= T.grip;
    const palm = { x: A.x + (gripped ? arm["f-grip"].palm[0] : F.palm[0]) * s, y: A.y + (gripped ? arm["f-grip"].palm[1] : F.palm[1]) * s };
    const showArm = el >= T.strike[0];
    // Everything of the arm past its base is inside the hole: clip it there.
    const clipR = X(baseHX) + 6 * s;
    const armImg = (name) => at(image(PIT + name), A.x, A.y, F.w * s, F.h * s);
    const clipArm = (child) => div().absolute().left(0).top(0).w(Math.max(0, Math.round(clipR))).h(region.h).overflow_hidden().child(child);

    // The goblin: flails where he stands; once gripped he's drawn into the palm, then follows it exactly.
    const vArt = victim.art.replace(/-idle\.gif$/, "-blocked.gif");
    const home = { x: victim.x - rx, y: victim.y - ry };
    const inPalm = { x: palm.x - victim.w * 0.5, y: palm.y - victim.h * 0.52 };
    const k = gripped ? prog(el, T.lift, ease.out) : 0;
    const shake = gripped && el < T.yank[0] ? Math.sin(el / 22) * 2 * s : 0;   // he struggles in the grip
    const v = { x: home.x + (inPalm.x - home.x) * k + shake, y: home.y + (inPalm.y - home.y) * k };

    if (showArm && el < T.close) kids.push(clipArm(armImg(gripped ? "arm-f-grip.png" : "arm-f.png")));
    if (el < T.close) kids.push(at(image(vArt), v.x, v.y, victim.w, victim.h));
    if (showArm && gripped && el < T.close) kids.push(clipArm(armImg("arm-f-grip-front.png")));
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
