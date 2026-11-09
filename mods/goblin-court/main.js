// Goblin Keep court (left side of the cutscene layout): clan banners, the queue, the petitioner.
// - Banners: one per Herdr space (clan). Click to filter the queue; click the same banner again to clear.
// - Queue: every other goblin in one line, ordered by need (blocked, done, working, idle; oldest change
//   first; a goblin is as needy as its neediest runt). Click one to open its tab.
// - Petitioner: the focused tab's goblin at the front, facing the King; its runts at its feet.
// - Runts (terminals started with `hc run`, parent = a goblin): stay with their parent. Click one and it
//   steps forward while its parent steps aside, and its terminal replaces the main one (terminal.show).
//   Click the parent to step back. A runt stuck on Claude Code's "trust this folder?" prompt counts as asking.
// - Switching who's in front: they walk up, and the dialogue box (goblin-curtain overlay) opens on arrival.
// - The pit: king-corner's button -> goblin-pit-confirm -> shared "goblin.pit" -> this opens the goblin-pit
//   overlay (hand drags the goblin in, then the tab closes).
// Stand-in art from mods/goblin-court/art (made by Documents/GoblinKing/mockups/make_court_art.py).
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { rightOfKing } from "./layout-util.js";   // same file as king-corner/layout-util.js
import { layout, agents, appHome, closeOverlay, focused, hc, openOverlay, readTextFile, run, settings, setShared, shared, spaces, terminals, theme } from "herdr";

const ART = "mods/goblin-court/art/";
const CLAN_COLORS = ["#963c1e", "#3c4678", "#285a3c", "#6e286e", "#484a52", "#28646e"]; // = make_court_art.py CLANS
const GOLD = "#bca251", INK = "#071410", AMBER = "#f0a028", TEXT = "#e6dcbe";
// Ink on the parchment nameplates: dark brown text, dried-blood red when it needs the King, dark gold when done.
const INK_TEXT = "#2a160c", INK_DIM = "#5a3a22", INK_RED = "#8a1a10", INK_GOLD = "#6a4a08";
const RANK = { blocked: 0, done: 1, working: 2, idle: 3, unknown: 3 };
const SPEED = 110;        // walking speed, logical px per second (slow, deliberate shuffle)
const BANNERS_H = 190;    // space the banners take at the top
const PLATE_H = 64;       // petitioner nameplate height until plates.json loads
// Layout geometry around the terminal (layouts/goblin-cutscene.json): work-body padding 8, gap 4,
// tabs bar 42, status bar 28.
const PAD = 8, GAP = 4, TABS = 42, STATUS = 28;
const BG = "mods/goblin-court/art/hall/goblin-hall.png";  // v4: pit moved 240 px left, out from under the King (Documents/GoblinKing/room/pitmove/move_pit.py)  // the hall at 2x (Documents/GoblinKing/room/hall2x/hall-2x.png), 128 px goblins
const BG_W = 1152, BG_H = 896, FLOOR_IMG_Y = 496;  // room image: wall meets floor at y 496
// Perspective of the room art: tiles at the bottom edge (y 720) are ~1.45x wider than at the wall (y 400), so
// sizes scale with (y - HORIZON_IMG). FIG_AT_WALL: a goblin's height standing at the wall, in image px
// (the bench by the wall is ~60 px tall: a goblin stands about bench height).
const HORIZON_IMG = -1500, FIG_AT_WALL = 143;  // nearly front-on hall; FIG_AT_WALL = the kit2 body height (143 rows), so goblin pixels = room pixels at the wall
const PIT_IMG = { x: 700, y: 684, rx: 176 };       // room image: centre and half-width of the pit opening
const PIT_MS = 6000;                               // a pit request older than this is stale
// Pose variants per state (Documents/GoblinKing/kit2/build.py): gif suffix. Each agent keeps one per state
// (picked from its address), so neighbours with the same status don't do the same thing. "excited" = hovered.
const VARIANTS = { doze: ["", "-a", "-b"], idle: ["", "-a", "-b"], working: ["", "-a", "-b"], blocked: ["", "-a", "-b"], excited: ["-a", "-b", "-c"] };
const VARIANTS_LIVE = true;    // false falls back to the base poses
const hashOf = (s) => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h; };

const dimmed = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
};

export default class GoblinCourt extends View {
  init(_p, cx) {
    this.size = { width: 320, height: 800 };
    this.filter = null;     // space id, or null for every clan
    this.at = {};           // address -> last spot {x, y, w, h}
    this.walk = {};         // address -> { until, dur, left, fromDoor }
    this.fromDoor = {};     // address -> true while a newcomer stands in the doorway
    this.ready = false;     // after the first render, unseen goblins are newcomers and come in by the door
    this.doorFeet = null;   // where a newcomer stands in the doorway, set every render
    this.front = undefined; // who stood in front last render (goblin or runt address)
    this.win = null;        // window size (logical), from window.json
    this.stuck = {};        // runt address -> true while it sits on a startup prompt (trust)
    this.pitDone = null;    // the pit request already played
    this.hover = null;      // address of the queued goblin under the pointer (it gets excited)
    this.hits = [];         // queued goblins as drawn last render, front first: {addr, x, y, w, h, pose}
    this.masks = {};        // pose -> 192 rows of [x0, x1) spans (kit2/build.py): hover/click only on the goblin
    this.plates = null;     // parchment nameplate pieces (Documents/GoblinKing/ui/nameplate/build_plates.py)
    readTextFile(appHome() + "/mods/goblin-court/art/ui/plate/plates.json").then((t) => { this.plates = JSON.parse(t); }).catch(() => {});
    this.torches = {};      // animated torch flames (Documents/GoblinKing/room/torches): name -> hall px box
    readTextFile(appHome() + "/mods/goblin-court/art/torch/torches.json").then((t) => { this.torches = JSON.parse(t); }).catch(() => {});
    readTextFile(appHome() + "/mods/goblin-court/art/kit2/masks.json").then((t) => { this.masks = JSON.parse(t); }).catch(() => {});
    this.readWindow(cx);
    // The pit arm's poses (Documents/GoblinKing/hand/arm/build_arm.py): base + palm per pose, for the pit scene.
    this.armMeta = {};
    readTextFile(appHome() + "/mods/goblin-court/art/pit/arm.json").then((t) => { this.armMeta = JSON.parse(t); }).catch(() => {});
    // Data check, not animation: redraw only when a walker arrives, so it stops bobbing.
    cx.timer.every(200, (cx) => {
      const now = Date.now();
      let arrived = false;
      if (this.entering) { this.entering = false; arrived = true; } // newcomer in the doorway: start its walk
      for (const k in this.walk) if (this.walk[k].until <= now) { delete this.walk[k]; arrived = true; }
      if (arrived) cx.notify();
    });
    // Runts that report no status yet may be stuck on Claude Code's trust prompt: read their screens.
    cx.timer.every(3000, (cx) => this.checkStuck(cx));
  }

  checkStuck(cx) {
    const reported = new Set(agents().map((a) => a.address));
    const quiet = terminals().filter((x) => (x?.parent?.address ?? x?.parent) && x.state === "live" && !reported.has(x.address));
    const live = new Set(quiet.map((x) => x.address));
    let changed = false;
    for (const k of Object.keys(this.stuck)) if (!live.has(k)) { delete this.stuck[k]; changed = true; }
    if (changed) cx.notify();
    for (const x of quiet) {
      hc(["read", "--lines", "0", x.address]).then((r) => {
        const asking = /trust this folder|Do you trust/i.test(r?.stdout ?? "");
        if (asking !== !!this.stuck[x.address]) {
          if (asking) this.stuck[x.address] = true; else delete this.stuck[x.address];
          cx.notify();
        }
      }).catch(() => {});
    }
  }

  // Nameplates (Documents/GoblinKing/ui/nameplate): "big" = parchment nailed on planks, for the goblin in front;
  // "tag" = a small parchment scrap over queued heads. Fixed art at the room's pixel size; the text is centred by
  // layout inside the parchment's own box (measured from the art: plates.json "text"), so it lines up with the paper.
  // Returns { el, w, h, tw } (tw = text box width) or null before plates.json loads.
  plate(kind, id, px, lines) {
    const m = this.plates?.[kind];
    if (!m) return null;
    const w = Math.round(m.w * px), h = Math.round(m.h * px);
    const [x0, y0, x1, y1] = m.text.map((v) => v * px);
    const el = div().id(id).relative().w(w).h(h)
      .child(image(ART + `ui/plate/${kind}.png`).absolute().left(0).top(0).w(w).h(h))
      .child(v_flex().absolute().left(x0).top(y0).w(x1 - x0).h(y1 - y0).items_center().justify_center().overflow_hidden().children(lines));
    return { el, w, h, tw: x1 - x0 };
  }

  // Where a pose's head is on the 192 canvas: its top row and the middle of its top 16 rows (from masks.json).
  headOf(pose) {
    this.heads ??= {};
    if (this.heads[pose]) return this.heads[pose];
    const rows = this.masks[pose];
    if (!rows) return { x: 96, top: 43 };
    const top = rows.findIndex((r) => r.length);
    let sum = 0, n = 0;
    for (let y = top; y < top + 16 && y < rows.length; y++) for (const [a, b] of rows[y]) { sum += (a + b) / 2 * (b - a); n += b - a; }
    return (this.heads[pose] = { x: n ? sum / n : 96, top });
  }

  // Which queued goblin's own pixels are under a point (block px)? Front-most first.
  hitAt(p) {
    for (const h of this.hits) {
      if (p.x < h.x || p.y < h.y || p.x >= h.x + h.w || p.y >= h.y + h.h) continue;
      const rows = this.masks[h.pose];
      if (!rows) return h.addr;   // masks not loaded yet: fall back to the box
      const u = h.w / 192;
      const mx = (p.x - h.x) / u, row = rows[Math.floor((p.y - h.y) / u)] ?? [];
      if (row.some(([a, b]) => mx >= a && mx < b)) return h.addr;
    }
    return null;
  }

  // Start a walk when a goblin's spot changes; walking time follows distance.
  track(addr, p) {
    const prev = this.at[addr];
    this.at[addr] = p;
    if (!prev || (prev.x === p.x && prev.y === p.y)) return 0;
    const dur = Math.max(900, Math.round((Math.hypot(p.x - prev.x, p.y - prev.y) / SPEED) * 1000));
    const fromDoor = !!this.fromDoor[addr];
    delete this.fromDoor[addr];
    this.walk[addr] = { until: Date.now() + dur, dur, left: p.x < prev.x, fromDoor };
    return dur;
  }

  // A goblin seen for the first time (a new tab, after the court is up) appears in the doorway for one
  // frame; the next render (timer below) walks it from there to its spot.
  arrive(addr, spot, box) {
    if (this.at[addr] || !this.ready || !this.doorFeet) return spot;
    this.fromDoor[addr] = true;
    this.entering = true;
    return box(this.doorFeet.x, this.doorFeet.y);
  }

  // The hall's placement: scaled to the window's HEIGHT (never cropped top/bottom, so the room and goblins keep
  // their size on any screen shape). A window narrower than the hall shows its middle (the same crop as the layout
  // background); a wider one (16:9, ultrawide) shows its left side in the court (offX) and its right side in
  // king-corner (offXk); the terminal covers the middle, so the two never have to meet. Logical px.
  cover() {
    const win = this.win;
    if (!win) return null;
    const s = win.h / BG_H, extra = win.w - BG_W * s;
    return { s, offX: Math.min(0, extra / 2), offXk: Math.max(extra, extra / 2), offY: 0 };
  }

  // Where the wall meets the floor, in this block's coordinates.
  floorLine(H) {
    const c = this.cover();
    return c ? c.offY + FLOOR_IMG_Y * c.s - (TABS + PAD) : H * 0.5;
  }

  readWindow(cx) {
    readTextFile(appHome() + "/window.json").then((txt) => {
      const b = JSON.parse(txt)?.bounds;
      const z = settings().zoom || 1;
      if (b && !this.win?.live) { this.win = { w: b[2] / z, h: b[3] / z }; cx.notify(); }
    }).catch(() => {});
  }

  // The terminal's rectangle in window coordinates (logical px), or null when unknown.
  termRect() {
    const z = settings().zoom || 1;
    const kingW = Number(shared("goblin.kingW")) || 0;
    if (!this.win || !kingW) return null;
    const courtW = this.size.width / z;
    const x = PAD + courtW + GAP, y = TABS + PAD;
    const w = Math.round(this.win.w - x - GAP - kingW - rightOfKing(layout()) - PAD), h = Math.round(this.win.h - TABS - STATUS - 2 * PAD);
    return w < 100 || h < 100 ? null : { x, y, w, h };
  }

  // Lay the dialogue-box curtain over the terminal: closed while the goblin walks up, then open.
  openCurtain(hold, terminal) {
    const r = this.termRect();
    if (!r) return; // geometry unknown: skip the flourish rather than cover the wrong place
    const z = settings().zoom || 1;
    // Measured: `at` is in unzoomed px while width/height are zoomed, so scale the position.
    // A newer walk-up replaces the old curtain: left open, it would re-focus the previous goblin's tab.
    if (this.curtain) { try { closeOverlay(this.curtain); } catch {} }
    this.curtain = openOverlay({ mod: "goblin-curtain", kind: "popup", frame: "none", at: { x: r.x * z, y: r.y * z }, width: r.w, height: r.h,
      // No hall behind the page: the layout background is plain dark (only the court and King's column draw the
      // hall, so it can never be out of line at the seams).
      props: { w: r.w, h: r.h, x: r.x, y: r.y, winW: this.win.w, winH: this.win.h, bg: null, bgW: BG_W, bgH: BG_H,
        hold, open: 450, terminal } });
  }

  // Play the pit (mods/goblin-pit): the arm comes out of the pit, grabs the petitioner where it stands and drags it
  // in, then its tab closes. The scene is drawn whole (room, queue, King, arm, pit lip) in two borderless popups
  // that tile the screen below the banners, on one clock, so nothing is cut at a block edge.
  openPit(req, petRect, art, scene) {
    const term = this.termRect(), c = this.cover();
    const kingW = Number(shared("goblin.kingW")) || 0;
    if (!term || !c || !kingW) { run("tab.close", { id: req.tab, confirmed: true }); return; }
    const z = settings().zoom || 1;
    const win = this.win;
    // The King as king-corner draws him: king-closeup.png 288x432 at the room's pixel scale, his box at the bottom
    // of the column, spilling 40 art px past its right edge; the column clips him.
    const kw = Math.round(288 * c.s), kh = Math.round(432 * c.s);
    const colX = win.w - PAD - rightOfKing(layout()) - kingW, colY = TABS + PAD, colH = win.h - TABS - STATUS - 2 * PAD;
    const king = { src: ART + "king-closeup.png", x: colX + Math.round(kingW - kw + 40 * c.s), y: colY + colH - kh, w: kw, h: kh,
      clipR: colX + kingW, colX };
    const figs = scene.map((f) => ({ ...f, x: PAD + f.x, y: TABS + PAD + f.y }));
    const bottom = win.h - STATUS;
    const courtR = term.x - GAP / 2;
    const regions = [
      { x: 0, y: TABS + PAD + BANNERS_H, w: courtR, h: bottom - (TABS + PAD + BANNERS_H), main: false },
      { x: courtR, y: TABS, w: win.w - courtR, h: bottom - TABS, main: true },
    ];
    const t0 = Date.now() + 60;   // both start on the same clock
    for (const r of regions) {
      // `at` is in unzoomed px, width/height in zoomed (logical) px (measured, see openCurtain).
      openOverlay({ mod: "goblin-pit", kind: "popup", frame: "none", at: { x: r.x * z, y: r.y * z }, width: r.w, height: r.h,
        props: { region: r, main: r.main, t0, cover: c, term, figs, king, victim: { ...petRect, art }, tab: req.tab, req: req.t,
          bg: BG, bgW: BG_W, bgH: BG_H, arm: this.armMeta } });
    }
  }

  render(_cx) {
    const t = theme();
    const z = settings().zoom || 1;
    // The window's live size (GPUI's viewport, legal during render), in this mod's units (unzoomed). Works
    // maximised, at any display scaling and right after a resize; window.json (readWindow) is only a fallback.
    try {
      const vp = globalThis.window?.viewport_size?.();
      if (vp && vp.width > 0) this.win = { w: vp.width / z, h: vp.height / z, live: true };
    } catch (_e) { /* older Herdr: keep window.json */ }
    const W = this.size.width / z, H = this.size.height / z;
    const sp = spaces();
    const clanOf = {};
    sp.forEach((s, i) => { clanOf[s.id] = i % CLAN_COLORS.length; });
    if (this.filter && !clanOf.hasOwnProperty(this.filter)) this.filter = null;

    const f = focused();
    const list = agents();
    // Runts: terminals started by another terminal (hc run). They stay with their parent goblin and never
    // queue on their own; their status comes from agents() when they report one.
    const terms = terminals();
    const parentOf = {};
    terms.forEach((x) => { const p = x?.parent?.address ?? x?.parent; if (p) parentOf[x.address] = p; });
    const statusOf = {};
    list.forEach((a) => { statusOf[a.address] = a.status; });
    const runtsOf = (addr) => terms.filter((x) => parentOf[x.address] === addr && x.state !== "finished")
      .map((x) => ({ address: x.address, name: x.name || x.address, clan: clanOf[list.find((a) => a.address === addr)?.space] ?? 0,
        status: this.stuck[x.address] ? "blocked" : (statusOf[x.address] ?? x.status ?? "working"),
        stuck: !!this.stuck[x.address] }));
    // A goblin needs the King as much as its neediest runt does.
    const eff = (a) => runtsOf(a.address).reduce((best, r) => ((RANK[r.status] ?? 3) < (RANK[best] ?? 3) ? r.status : best), a.status);
    // The focused pane's own goblin (a runt shown in its pane doesn't replace it).
    // Never focused().agent: it names some other agent when this tab's terminal isn't a reporting agent yet.
    const me = list.find((a) => f?.pane && a.pane === f.pane && a.tab === f.tab && !parentOf[a.address])
      ?? list.find((a) => f?.terminal && a.address === f.terminal && a.tab === f.tab);
    const shownRunt = f?.shown && me && parentOf[f.shown] === me.address ? f.shown : null;

    // The pit: hide the petitioner while it's being dragged in.
    const pitReq = shared("goblin.pit");
    const pitLive = pitReq && Date.now() - (pitReq.t || 0) < PIT_MS;
    const pitting = pitLive && me && pitReq.address === me.address;

    // ---- Banners ----
    // Clan banners: the hall's own banner (Documents/GoblinKing/ui/build_ui.py), recoloured per clan, drawn at the
    // room's pixel size. Click to filter the queue to that clan (selected lifts and brightens, others dim);
    // click again to clear.
    const bpx = Number(shared("goblin.px")) || 1.25;
    const BW = Math.round(48 * bpx), BH = Math.round(96 * bpx);
    const banners = h_flex().gap(6).px(10).pt(6).flex_wrap().children(sp.map((s) => {
      const i = clanOf[s.id];
      const on = this.filter === s.id;
      const off = this.filter && !on;
      const art = ART + `ui/banner-${i}${on ? "-on" : off ? "-off" : ""}.png`;
      return v_flex().id(`banner-${s.id}`).items_center().gap(2).cursor_pointer()
        // Picking a clan also shows its space, so the tab bar at the top lists that clan's tabs.
        .on_click((_e, cx) => { this.filter = on ? null : s.id; if (!on) run("space.select", { id: s.id }); cx.notify(); })
        .child(div().relative().w(BW).h(BH).child(image(art).absolute().left(0).top(on ? -4 : 0).w(BW).h(BH)))
        .child(div().text_size(11).text_color(off ? t.dim : on ? GOLD : TEXT).truncate().max_w(BW + 16).child(s.name || "~"));
    })).child(
      // Found a new clan (a clan is just a group of agent tabs = a Herdr space): ask for its name, then make the
      // space with a Claude agent as its first tab, whose goblin walks in through the door.
      v_flex().id("banner-new").items_center().gap(2).cursor_pointer()
        .on_click(() => openOverlay({ mod: "goblin-prompt", kind: "dialog", modal: true, frame: "none", width: 442, height: 252,
          props: { title: "Name the new clan", value: "", action: "Found clan", hint: "Its first goblin comes in through the door.",
            command: { name: "space.new", args: { argv: ["claude"] } } } }))
        .child(div().relative().w(BW).h(BH).hover((st) => st.opacity(1)).opacity(0.75)
          .child(image(ART + "ui/banner-new.png").absolute().left(0).top(0).w(BW).h(BH))
          .child(div().absolute().left(0).top(Math.round(BH * 0.3)).w(BW).flex().justify_center()
            .child(div().text_size(24).font_semibold().text_color(GOLD).child("+"))))
        .child(div().text_size(11).text_color(t.dim).child("New clan")));

    // ---- Perspective ----
    // One rule for everyone: a figure's size comes only from where its feet are on the floor, using the room
    // art's own perspective (floor tiles at the bottom edge are ~1.45x wider than at the wall, so the floor's
    // vanishing line sits HORIZON_IMG above the image). Moving down the floor = coming closer = growing, smoothly.
    const floorY = this.floorLine(H);
    const cv = this.cover() ?? { s: H / BG_H, offY: 0 };
    // Share the room's pixel scale so other mods (the King) draw at the same pixel size.
    const pxScale = Math.round(cv.s * 1000) / 1000;
    if (this.cover() && shared("goblin.px") !== pxScale) setShared("goblin.px", pxScale);
    // The hall's placement in the window, so king-corner can lay its torch over the same pixels.
    if (this.cover() && this.win) {
      const c = this.cover(), cov = { s: c.s, offX: c.offX, offXk: c.offXk, offY: c.offY, winW: this.win.w };
      if (JSON.stringify(shared("goblin.cover")) !== JSON.stringify(cov)) setShared("goblin.cover", cov);
    }
    const toImgY = (fy) => (fy + TABS + PAD - cv.offY) / cv.s;
    const figAt = (fy) => FIG_AT_WALL * cv.s * (toImgY(fy) - HORIZON_IMG) / (FLOOR_IMG_Y - HORIZON_IMG);
    // Kit2 sprites are 192x192 with the feet on row 186 and the body (rows 43..186 = 143 rows) centred on column 96.
    const kitBox = (fx, fy) => { const u = figAt(fy) / 143; return { x: Math.round(fx - 96 * u), y: Math.round(fy - 186 * u), w: Math.round(192 * u), h: Math.round(192 * u), fy }; };
    // Runt GIFs (Documents/GoblinKing/runt/build_runt.py) are 96x96 with the feet on row 82 and the body centred on
    // column 50, drawn at the goblins' own pixel scale (u = figAt / 143), so a crouching runt is ~half a goblin.
    const runtBox = (fx, fy) => { const u = figAt(fy) / 143; return { x: Math.round(fx - 50 * u), y: Math.round(fy - 82 * u), w: Math.round(96 * u), h: Math.round(96 * u), fy }; };

    // ---- Spots (feet positions) ----
    // The petitioner (and the runts at his feet) stand just above the big nameplate.
    const plateH = this.plates?.big ? Math.round(this.plates.big.h * bpx) + 4 : PLATE_H;
    const petFeet = { x: Math.round(W * 0.3), y: Math.round(H - plateH - 14) };
    const frontSpot = kitBox(petFeet.x, petFeet.y);
    const pw = frontSpot.w, ph = frontSpot.h;
    // A runt that steps forward stands where the goblin would; its parent steps aside to the right, a step back.
    const asideFeet = { x: Math.round(W * 0.74), y: petFeet.y - 40 };
    const asideSpot = kitBox(asideFeet.x, asideFeet.y);
    const line = list
      .filter((a) => a.address !== me?.address && !parentOf[a.address])
      .filter((a) => !this.filter || a.space === this.filter)
      .sort((a, b) => (RANK[eff(a)] ?? 3) - (RANK[eff(b)] ?? 3) || a.seq - b.seq);
    // The line runs diagonally across the floor: its front just behind the petitioner's shoulder (right),
    // its back near the wall (left). Spacing along the floor is even; perspective does the shrinking.
    const stepAside = !!shownRunt && !pitting;
    const backFeet = { x: W * 0.16, y: floorY + 34 };
    const frontFeet = stepAside ? { x: W * 0.52, y: asideFeet.y - 50 } : { x: W * 0.78, y: petFeet.y - 70 };
    const n = Math.max(1, line.length);
    const spotFor = (i) => {
      const d = n === 1 ? 0 : i / (n - 1);                  // 0 = front of the line, 1 = back
      const fx = frontFeet.x - (frontFeet.x - backFeet.x) * d + (i % 2 ? 8 : -8);
      const fy = frontFeet.y - (frontFeet.y - backFeet.y) * d;
      return kitBox(Math.round(fx), Math.round(fy));
    };

    // Draw order: shadows first, then figures far to near (by feet), then labels on top.
    const shadows = [], figs = [], labels = [];
    // The door is painted into the hall itself (Documents/GoblinKing/room/hall2x/hall-2x-v3.png), left of the first
    // pillar; its opening is image x 98..202, y 290..468. Closed = just the background. While a newcomer comes in,
    // the dark opening (hall-door3-open.png, arch-shaped) is drawn over it; newcomers appear in the doorway.
    const DOOR_OPEN = { x: 98, y: 290, w: 105, h: 179 };
    const toX = (ix) => (cv.offX ?? 0) + ix * cv.s - PAD;
    const toY = (iy) => (cv.offY ?? 0) + iy * cv.s - (TABS + PAD);
    const doorFeet = { x: Math.round(toX(DOOR_OPEN.x + DOOR_OPEN.w / 2)), y: Math.round(toY(DOOR_OPEN.y + DOOR_OPEN.h)) };
    this.doorFeet = doorFeet;
    // Built at the end (after newcomers are placed), so the door is already open on their first frame.
    const doorEl = () => (this.entering || this.exiting || Object.values(this.walk).some((w) => w.fromDoor))
      ? image(ART + "hall-door3-open.png").absolute().left(toX(DOOR_OPEN.x)).top(toY(DOOR_OPEN.y)).w(DOOR_OPEN.w * cv.s).h(DOOR_OPEN.h * cv.s)
      : div();
    const goblins = [];
    const hits = [];
    // Animated torch flames over the hall's own (same pixels, only the flame moves); those inside this block.
    const torchEls = this.cover() ? Object.entries(this.torches).map(([k, b]) => ({ k, x: toX(b.x), y: toY(b.y), w: b.w * cv.s, h: b.h * cv.s }))
      .filter((b) => b.x + b.w > 0 && b.x < W && b.y + b.h > 0 && b.y < H)
      .map((b) => image(ART + `torch/${b.k}.gif`).absolute().left(b.x).top(b.y).w(b.w).h(b.h)) : [];
    // What is drawn where (block px), so the pit scene can redraw the hall as it stands.
    const scene = [];
    let walkUp = 0;
    const tr0 = (wk) => ({ duration: wk ? wk.dur : 300, easing: wk ? "linear" : "ease-in-out" });
    const shadow = (id, spot, tr, kind) => {
      // Under the feet: kit2 feet span ~ columns 60..132 of 192; runt feet ~ 21..79 of 96.
      const k = kind === "runt" ? { l: 0.22, w: 0.6, t: 0.83 } : { l: 0.31, w: 0.38, t: 0.955 };
      return div().id(id).absolute()
        .left(spot.x + spot.w * k.l).top(spot.y + spot.h * k.t).w(spot.w * k.w).h(Math.max(3, spot.h * 0.05))
        .rounded(999).bg("#00000066")
        .transition("left", tr).transition("top", tr).transition("width", tr).transition("height", tr);
    };
    const bang = (w, size) => div().absolute().left(w - size * 0.6).top(-size * 0.7).w(size).h(size).rounded(size)
      .bg(AMBER).border(1).border_color(INK).flex().items_center().justify_center()
      .child(div().text_size(Math.round(size * 0.7)).font_semibold().text_color(INK).child("!"));

    // A runt: small, with its own "!" and a hop when it has a question. Click: step forward (its terminal
    // replaces the main one). The same id at the feet and in front, so it walks between them.
    const runtEl = (r, spot0, onClick) => {
      const spot = this.arrive(r.address, spot0, runtBox);
      const dur = this.track(r.address, spot);
      const wk = this.walk[r.address];
      const tr = tr0(wk);
      const { x, y, w, h } = spot;
      // Animated like the goblins: walk (mirrored heading left), blocked = hops and waves, working, idle.
      const asks = r.status === "blocked";
      const rstate = wk ? (wk.left ? "walk-left" : "walk") : asks ? "blocked" : r.status === "working" ? "working" : "idle";
      // Each runt keeps one pose set (from its address), like the goblins; the walk is shared.
      const rv = wk ? "" : ["", "-a", "-b"][hashOf(r.address) % 3];
      const src = ART + `runt/runt-${r.clan ?? 0}-${rstate}${rv}.gif`;
      const fig = image(src).absolute().left(0).top(0).size_full();
      shadows.push(shadow(`rs-${r.address}`, spot, tr, "runt"));
      scene.push({ src, x, y, w, h, z: spot.fy, kind: "runt" });
      figs.push({ z: spot.fy, el: div().id(`g-${r.address}`).absolute().left(x).top(y).w(w).h(h)
        .transition("left", tr).transition("top", tr).transition("width", tr).transition("height", tr)
        .when(!!onClick, (el) => el.on_click(onClick))
        .child(fig)
        .when(asks && !wk, (el) => el.child(bang(w * 0.8, Math.max(12, Math.round(w * 0.3))))) });
      return dur;
    };

    // A goblin at a spot. Everyone uses the kit: walking = walk cycle (mirrored heading left); standing =
    // their state's pose. In the queue idle goblins doze; in front they stand awake.
    // opts.avoid: the gif the goblin beside it shows; if this one would match, it takes its next variant.
    const pose = (addr, state, avoid) => {
      const vs = VARIANTS_LIVE ? VARIANTS[state] : null;
      if (!vs) return state === "excited" ? "idle" : state;
      const k = hashOf(addr);
      let name = state + vs[k % vs.length];
      if (name === avoid) name = state + vs[(k + 1) % vs.length];
      return name;
    };
    const place = (a, spot0, opts = {}) => {
      const spot = this.arrive(a.address, spot0, kitBox);
      const dur = this.track(a.address, spot);
      if (opts.front) walkUp = dur;
      const wk = this.walk[a.address];
      const tr = tr0(wk);
      const st = eff(a);
      const excited = opts.queued && !wk && this.hover === a.address;
      const kitState = wk ? (wk.left ? "walk-left" : "walk")
        : pose(a.address, excited ? "excited" : ({ blocked: "blocked", done: "done", working: "working" }[st] ?? (opts.queued ? "doze" : "idle")), opts.avoid);
      const fig = image(ART + `kit2/goblin-${clanOf[a.space] ?? 0}-${kitState}.gif`).absolute().left(0).top(0).size_full();
      shadows.push(shadow(`s-${a.address}`, spot, tr));
      scene.push({ src: ART + `kit2/goblin-${clanOf[a.space] ?? 0}-${kitState}.gif`, x: spot.x, y: spot.y, w: spot.w, h: spot.h, z: spot.fy });
      figs.push({ z: spot.fy, el: div().id(`g-${a.address}`).absolute()
        .left(spot.x).top(spot.y).w(spot.w).h(spot.h)
        .transition("left", tr).transition("top", tr).transition("width", tr).transition("height", tr)
        .when(!!opts.onClick, (el) => el.on_click(opts.onClick))
        .child(fig) });
      if (opts.queued && !wk) hits.push({ addr: a.address, x: spot.x, y: spot.y, w: spot.w, h: spot.h, z: spot.fy, pose: kitState });
      if (opts.queued && !wk) {
        const rs = runtsOf(a.address);
        const asks = rs.some((r) => r.status === "blocked");
        const u = spot.w / 192;
        // Name tag (small parchment) just above the head.
        const name = a.tab_name || a.address, line2 = asks && a.status !== "blocked" ? "a runt asks" : a.status;
        const tw = this.plates?.tag ? (this.plates.tag.text[2] - this.plates.tag.text[0]) * bpx : 60;
        const fk = bpx / 1.264;   // text scales with the room's pixel size (1.264 = the size it was designed at)
        const tagLines = [div().text_size(10 * fk).line_height(1.2).font_semibold().truncate().max_w(tw - 4).text_color(st === "blocked" ? INK_RED : st === "done" ? INK_GOLD : INK_TEXT).child(name),
          div().text_size(9 * fk).line_height(1.2).text_color(asks || st === "blocked" ? INK_RED : INK_DIM).child(line2)];
        const tag = this.plate("tag", `tag-${a.address}`, bpx, tagLines);
        // Anchored to this pose's real head (from its pixel mask), not the sprite box: in the diagonal queue a
        // box-placed tag sat nearer the goblin behind, so every name read as one goblin off (Ryan).
        const head = this.headOf(kitState);
        if (tag) labels.push(div().id(`l-${a.address}`).absolute()
          // The goblin behind stands up-left, so the tag hangs to the right of the head (over open floor).
          .left(Math.max(0, Math.min(W - tag.w, spot.x + head.x * u - tag.w * 0.3))).top(spot.y + head.top * u - tag.h + 4).child(tag.el));
        // Up to three runts huddle at this goblin's left heel, a little nearer the camera; the rest are "+N".
        rs.slice(0, 3).forEach((r, k) => runtEl(r, runtBox(spot.x + spot.w * 0.3 - k * 16 * u, spot.fy + 6 + k * 3),
          () => run("agent.focus", { terminal: a.address })));
        if (rs.length > 3) labels.push(div().id(`qrn-${a.address}`).absolute().left(Math.max(0, spot.x + spot.w * 0.3 - 128 * u)).top(spot.fy - 10)
          .text_size(9).text_color(TEXT).child(`+${rs.length - 3}`));
      }
      return kitState;
    };

    let prevPose = null;
    const clickQueued = () => { if (this.hover) run("agent.focus", { terminal: this.hover }); };
    line.forEach((a, i) => { prevPose = place(a, spotFor(i), { queued: true, avoid: prevPose, onClick: clickQueued }); });

    // Filtering by a clan: the other clans' goblins don't vanish, they walk out through the door (Ryan). Once
    // through, they're gone until the filter clears; then they come back in by the door (track() walks them
    // from the doorway, which is where they were last).
    const outSpot = kitBox(doorFeet.x, doorFeet.y);
    this.exiting = false;
    if (this.filter) {
      list.filter((a) => a.address !== me?.address && !parentOf[a.address] && a.space !== this.filter).forEach((a) => {
        const was = this.at[a.address];
        const atDoor = was && was.x === outSpot.x && was.y === outSpot.y;
        if (atDoor && !this.walk[a.address]) { this.fromDoor[a.address] = true; return; }   // through the door
        place(a, outSpot, {});
        this.exiting = true;
      });
    }

    let extras = [];
    let frontKey = null;
    if (me && !pitting) {
      const runts = runtsOf(me.address);
      const runtAsks = runts.some((r) => r.status === "blocked");
      const blocked = me.status === "blocked";
      const shown = shownRunt ? runts.find((r) => r.address === shownRunt) : null;
      if (shown) {
        // The runt has stepped forward; its parent steps aside. Click the parent to step back.
        frontKey = shown.address;
        place(me, asideSpot, { onClick: () => run("terminal.show", {}) });
        walkUp = runtEl(shown, runtBox(petFeet.x, petFeet.y), null);
        runts.filter((r) => r !== shown).slice(0, 4).forEach((r, i) =>
          runtEl(r, runtBox(asideFeet.x - 30 + i * 22, asideFeet.y + 8), () => run("terminal.show", { terminal: r.address })));
      } else {
        frontKey = me.address;
        place(me, frontSpot, { front: true });
        // Runts at the petitioner's feet, just in front of it (nearer the camera).
        runts.slice(0, 5).forEach((r, i) =>
          runtEl(r, runtBox(petFeet.x - pw * 0.3 + i * pw * 0.2, petFeet.y + 6), () => run("terminal.show", { terminal: r.address })));
        if (runts.length > 5) extras.push(div().id("runt-more").absolute().left(petFeet.x + pw * 0.75).top(petFeet.y - 14)
          .text_size(11).text_color(TEXT).child(`+${runts.length - 5}`));
        if (blocked) extras.push(div().id("bang").absolute().left(frontSpot.x + pw * 0.62).top(frontSpot.y + ph * 0.12).w(34).h(34).rounded(17)
          .bg(AMBER).border(2).border_color(INK).flex().items_center().justify_center()
          .child(div().text_size(20).font_semibold().text_color(INK).child("!")));
      }
      // Nameplate: whoever is in front.
      const title = shown ? shown.name : (me.tab_name || me.address);
      const amber = shown ? shown.status === "blocked" : (blocked || runtAsks);
      const sub = shown
        ? `runt of ${me.tab_name || me.address} · ${shown.stuck ? "asks: trust this folder?" : shown.status}`
        : `${me.space_name || "~"} clan · ${me.status}`
          + (runts.length ? ` · ${runts.length} ${runts.length === 1 ? "runt" : "runts"}` : "")
          + (runtAsks ? " · a runt asks" : "");
      // The big parchment plate, bottom left; the step-back hint (runt shown) sits just above it.
      const bw = this.plates?.big ? (this.plates.big.text[2] - this.plates.big.text[0]) * bpx : 140;
      const big = this.plate("big", "plate-art", bpx, [
        div().text_size(14 * bpx / 1.264).line_height(1.15).font_semibold().truncate().max_w(bw - 6).text_color(amber ? INK_RED : INK_TEXT).child(title),
        div().text_size(11 * bpx / 1.264).line_height(1.15).truncate().max_w(bw - 6).text_color(amber ? INK_RED : INK_DIM).child(sub)]);
      if (big) extras.push(v_flex().id("plate").absolute().left(8).top(H - big.h - 4)
        .when(!!shown, (el) => el.child(div().absolute().left(6).top(-16).text_size(10).text_color(t.dim)
          .child(`click ${me.tab_name || "the goblin"} to step back`)))
        .child(big.el));

      // Start the pit scene for a fresh request about this goblin.
    }
    if (pitLive && me && pitReq.address === me.address && this.pitDone !== pitReq.t) {
      this.pitDone = pitReq.t;
      const at = this.at[me.address] ?? frontSpot;
      this.openPit(pitReq, { x: PAD + at.x, y: TABS + PAD + at.y, w: at.w, h: at.h }, ART + `kit2/goblin-${clanOf[me.space] ?? 0}-idle.gif`, scene);
    }

    if (this.front !== undefined && frontKey && frontKey !== this.front && !pitting) {
      // Give the keyboard back to the goblin's terminal, but not while a runt is shown: focusing the
      // goblin's own terminal would undo terminal.show.
      this.openCurtain(Math.max(250, walkUp), shownRunt ? null : me?.address);
    }
    if (!pitting) this.front = frontKey;
    this.ready = true;
    this.hits = hits.sort((p, q) => q.z - p.z);
    if (this.hover && !hits.some((h) => h.addr === this.hover)) this.hover = null;   // walked off / left the queue
    const waiting = line.filter((a) => eff(a) === "blocked" || eff(a) === "done").length;

    return div().id("root").relative().size_full().overflow_hidden()
      .on_size_change((size, cx) => { this.size = size; this.readWindow(cx); cx.notify(); })
      // Hover = the goblin whose own pixels are under the pointer; leaving the court clears it.
      .on_mouse_move((e, cx) => {
        const z = settings().zoom || 1;   // local_position is in zoomed px; spots are unzoomed
        const h = this.hitAt({ x: e.local_position.x / z, y: e.local_position.y / z });
        if (h !== this.hover) { this.hover = h; cx.notify(); }
      })
      .on_hover((on, cx) => { if (!on && this.hover) { this.hover = null; cx.notify(); } })
      // The hall itself (see cover()), under everything in this block.
      .child(this.cover() ? image(BG).absolute().left(Math.round(toX(0))).top(Math.round(toY(0))).w(Math.round(BG_W * cv.s)).h(Math.round(BG_H * cv.s)) : div())
      .child(div().absolute().left(0).top(0).child(banners))
      .child(div().absolute().left(12).top(BANNERS_H).text_size(11).text_color(t.dim)
        .child(waiting ? `Waiting on you · ${waiting}` : "No one waiting"))
      .children([...torchEls, doorEl(), ...shadows, ...figs.sort((p, q) => p.z - q.z).map((p) => p.el), ...labels])
      .children(extras);
  }
}
