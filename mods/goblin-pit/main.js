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
const BASE_Y = 770;                                 // the arm's base row: low in the hole, so the root ends in the dark (Ryan: not out of the pit wall)
const REAR_X = 745;                                 // the rearing poses' root: body inside the opening, claw over its left edge
// Ryan: no jumping, no stretched arm, nothing clipped in the pit. So the goblin WALKS to a fixed spot at the pit's
// edge (always the same distance from the hole, so the painted arm always reaches him exactly), the arm rises out of
// the hole as painted (rear -> full reach as quick crossfades between the three paintings, its root in the hole under
// the near lip), the claw closes on him (talons in front, arm behind), and it hauls him back over the hole and down.
const SINK = 420;                                   // hall px the claw and goblin drop straight down into the hole
const RISE = 330;                                   // hall px the rearing arm comes up from under the near lip
const ease = { out: (u) => 1 - (1 - u) ** 3, in: (u) => u ** 3, inOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
const clamp01 = (u) => Math.min(1, Math.max(0, u));
const prog = (el, [a, b], f = ease.inOut) => f(clamp01((el - a) / (b - a)));
const HORIZON_IMG = -1500;                          // the hall's perspective (goblin-court): size grows with (y - horizon)

// The timeline, once the walk's length is known (ms from t0). Ryan (2026-11-11, vmock/vertical-B-fast.gif): the
// paintings are FRAMES (hard cuts, never crossfades): the arm comes up out of the hole (e), strikes (f), grabs him on
// the floor (f-grip), curves up (c), leans in over the hole (l), stands straight up (v), then goes straight down.
const timeline = (walkMs) => {
  const a = 560 + walkMs;                           // he arrives at the pit's edge
  const T = { roll: [30, 520], walk: [560, a], rise: [a + 60, a + 330] };
  T.cuts = [["e", a + 60], ["f", a + 470], ["f-grip", a + 590], ["c", a + 870], ["l", a + 980], ["v", a + 1090]];
  T.grip = a + 590; T.sink = [a + 1350, a + 1630]; T.close = a + 1680;
  T.unroll = [a + 2580, a + 3180]; T.end = a + 3230;
  return T;
};

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
      const T = this.T;
      if (!T) return;   // set by the first render (it needs the scene's geometry)
      const END = T.end;
      if (this.p.main && !this.closed && el >= T.close) {
        this.closed = true;
        // The court skips its own curtain for the walk-up this causes: this scene rolls the page back down.
        setShared("goblin.pitAfter", Date.now() + (T.end - T.close) + 300);
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
    const H = (wx, wy) => ({ x: (wx - offX) / s, y: (wy - offY) / s });      // window px -> hall px
    const at = (e, x, y, w, h) => e.absolute().left(Math.round(x)).top(Math.round(y)).w(Math.round(w)).h(Math.round(h));
    const kids = [];
    // Only what changes is drawn: the live court, queue, tags, nameplate and King show through around it.
    const clipT = (child) => at(div(), term.x - rx, term.y - ry, term.w, term.h).overflow_hidden().child(child);
    if (term) kids.push(clipT(at(image(bg), (cover.wideX ?? offX) - term.x, offY - term.y, bgW * s, bgH * s)));

    // Where each painted pose sits: full reach (f) roots at the hole's centre; the rearing poses (e, h) root at REAR_X,
    // where their whole body stays inside the opening (Ryan: further right, they clipped through the pit's right wall).
    const baseX = (name) => (arm[name]?.root ? (arm[name].root === "open" ? OPEN.x : REAR_X) : name[0] === "f" ? OPEN.x : REAR_X);
    const box = (name, drop = 0, dx = 0) => {
      const a = arm[name] ?? arm.f;
      return { x: X(baseX(name) + dx) - a.base[0] * s, y: Y(BASE_Y + drop) - a.base[1] * s, w: a.w * s, h: a.h * s, a };
    };
    const palmOf = (name, drop = 0, dx = 0) => { const b = box(name, drop, dx); return { x: b.x + b.a.palm[0] * s, y: b.y + b.a.palm[1] * s }; };

    // The goblin's walk: from where he stands to the spot whose chest is the full reach's palm, sized by perspective.
    const feetFrac = 186 / 192, chestFrac = 0.52;
    const start = { x: victim.x - rx, y: victim.y - ry, w: victim.w, h: victim.h };
    const startFeetH = H(victim.x + victim.w / 2, victim.y + victim.h * feetFrac).y;
    const P = palmOf("f");
    let k = 1;   // his size at the spot: height scales with the floor depth of his feet
    for (let it = 0; it < 4; it++) {
      const feetY = (P.y + ry) + victim.h * k * (feetFrac - chestFrac);
      k = (H(0, feetY).y - HORIZON_IMG) / (startFeetH - HORIZON_IMG);
    }
    const spot = { w: victim.w * k, h: victim.h * k };
    spot.x = P.x - spot.w * 0.5; spot.y = P.y - spot.h * chestFrac;
    if (!this.T) {
      const dist = Math.hypot(spot.x - start.x, spot.y - start.y) / s;          // hall px
      this.T = timeline(Math.round(Math.min(1500, Math.max(500, dist / 0.42))));   // ~420 hall px/s, 0.5..1.5 s
    }
    const T = this.T;

    // The arm: ONE painting at a time (hard cuts). e slides up out of the hole; the last one (v) sinks straight down.
    const drop = prog(el, T.sink, ease.in) * SINK;
    const gripped = el >= T.grip;
    let pose = null;
    if (el >= T.rise[0] && el < T.close) for (const [name, t] of T.cuts) if (el >= t && arm[name]) pose = name;
    const poseDrop = pose === "e" ? (1 - prog(el, T.rise, ease.out)) * RISE : pose === "v" ? drop : 0;
    const chestOf = (name) => arm[name]?.chest ?? chestFrac;
    const armEls = () => (pose ? [(() => { const b = box(pose, poseDrop); return at(image(PIT + `arm-${pose}.png`), b.x, b.y, b.w, b.h); })()] : []);

    // The goblin: walks to the pit's edge, flails, then is held in the claw and follows the palm exactly.
    const art = victim.art.replace(/-idle\.gif$/, "");
    let v, vSrc;
    if (el < T.walk[1]) {
      const u = prog(el, T.walk, (x) => x);
      v = { x: start.x + (spot.x - start.x) * u, y: start.y + (spot.y - start.y) * u, w: start.w + (spot.w - start.w) * u, h: start.h + (spot.h - start.h) * u };
      vSrc = el >= T.walk[0] ? `${art}-walk${spot.x < start.x ? "-left" : ""}.gif` : `${art}-blocked.gif`;
    } else {
      v = { ...spot }; vSrc = `${art}-blocked.gif`;
      if (pose && gripped) { const p = palmOf(pose, poseDrop); v.x = p.x - spot.w * 0.5; v.y = p.y - spot.h * chestOf(pose); }   // held: snaps to each painting's palm
      if (gripped && pose === "f-grip") v.x += Math.sin(el / 22) * 2 * s;   // he struggles in the grip
    }
    // The talons in front of him while he's held: the full reach's lower talons, and the straight-up claw's fingers.
    const front = gripped && (pose === "f-grip" || pose === "v") ? (pose === "f-grip" ? "f-grip-front" : "v-front") : null;
    const goblinEls = () => {
      const els = [at(image(vSrc), v.x, v.y, v.w, v.h)];
      if (front && arm[front === "f-grip-front" ? "f-grip" : "v-front"]) {
        const b = box(front === "f-grip-front" ? "f-grip" : "v-front", pose === "v" ? poseDrop : 0);
        els.push(at(image(PIT + `arm-${front}.png`), b.x, b.y, b.w, b.h));
      }
      return els;
    };
    // Drawn as the approved mock: the arm under the hole's darkness and near lip (it comes out of and goes back into
    // the pit); the goblin on top until he sinks, then under them too, so he disappears into the hole.
    const sinking = el >= T.sink[0];
    if (el < T.close) kids.push(...armEls(), ...(sinking ? goblinEls() : []));
    // The King gives the order (Ryan): a parchment speech bubble (the name-tag scrap, at the room's pixel size) beside
    // his head while the goblin walks to the edge, until the claw has him. Fades in and out.
    const king = this.p.king;
    if (king && king.colX != null) {
      const sayIn = prog(el, [T.walk[0] - 80, T.walk[0] + 120], ease.out), sayOut = 1 - prog(el, [T.grip + 150, T.grip + 400], ease.in);
      const o = Math.min(sayIn, sayOut);
      if (o > 0.02) {
        const bw = 96 * s * 1.1, bh = 30 * s * 1.1;   // tag.png 96x30 art px; text box 5..91 x 5..26
        const bx = king.colX - rx - bw - 4 * s, by = king.y - ry + king.h * 0.14 - (1 - sayIn) * 6 * s;
        kids.push(at(div(), bx, by, bw, bh).opacity(o)
          .child(image("mods/goblin-court/art/ui/plate/tag.png").absolute().left(0).top(0).size_full())
          .child(div().absolute().left(Math.round(5 / 96 * bw)).top(Math.round(5 / 30 * bh)).w(Math.round(86 / 96 * bw)).h(Math.round(21 / 30 * bh))
            .flex().items_center().justify_center()
            .child(div().text_size(Math.max(10, 12.5 * s)).font_semibold().text_color("#5a120c").child("Into the pit!"))));
      }
    }
    // The hole's darkness and near lip over them, inside the terminal's rectangle: what goes down disappears.
    if (term) {
      kids.push(clipT(at(image(PIT + "pit-shade.png"), X(OVER.x) - (term.x - rx), Y(OVER.y) - (term.y - ry), 430 * s, 336 * s)));
      kids.push(clipT(at(image(PIT + "pit-front.png"), X(OVER.x) - (term.x - rx), Y(OVER.y) - (term.y - ry), 430 * s, 336 * s)));
    }
    if (!sinking && el < T.close) kids.push(...goblinEls());   // whole, on top, until he sinks
    // The terminal's torn page slides up off the top (torn edge leading), and at the end slides back down; drawn
    // exactly as the terminal block draws it (cover fit, centred), so start and end match the terminal.
    const up = el < T.unroll[0] ? prog(el, T.roll, ease.in) : 1 - prog(el, T.unroll, ease.out);
    if (term && up < 1) {
      const PW = 312, PHt = 528, ps = Math.max(term.w / PW, term.h / PHt);
      kids.push(clipT(at(image(PAGE), (term.w - PW * ps) / 2, (term.h - PHt * ps) / 2 - term.h * up, PW * ps, PHt * ps)));
    }
    return div().id("root").relative().w(region.w).h(region.h).overflow_hidden().children(kids);
  }
}
