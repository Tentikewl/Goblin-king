// Goblin Keep: "Cast into the pit?" Always asked before the pit (it closes the tab: the agent and its runts end).
// Same look as goblin-prompt: borderless, the torn parchment panel (art/ui/dialog-panel.png), gold title,
// the goblin plaque as "Cast in". Open it at 442 x 252 with frame "none".
// props: { address, tab, name, runts }. Enter or "Cast in" -> shared "goblin.pit"; Esc or "Spare" closes.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, props, setShared } from "herdr";

const UI = "mods/goblin-court/art/ui/";
const GOLD = "#bca251", TEXT = "#e6dcbe", DIM = "#a8987a", BLOOD = "#c0505e";
const PANEL_W = 442, PANEL_H = 252;     // dialog-panel.png (316x180, shadow included) at x1.4
const PW = 158, PH = 66;                // pit-plaque.png (126x53) at x1.25

export default class PitConfirm extends View {
  init(_p, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  cast() {
    const p = props();
    closeOverlay(p.overlay);
    setShared("goblin.pit", { address: p.address, tab: p.tab, t: Date.now() });
  }

  render(_cx) {
    const p = props() ?? {};
    const runts = p.runts || 0;
    const hot = !!this.hot;
    const plaque = div().id("cast").relative().w(PW).h(PH).cursor_pointer()
      .on_hover((h, cx) => { this.hot = h; cx.notify(); })
      .on_click(() => this.cast())
      .child(image(UI + `pit-plaque${hot ? "-hover" : ""}.png`).absolute().left(0).top(0).w(PW).h(PH))
      .child(div().absolute().left(Math.round(PW * 0.27)).top(Math.round(PH * 0.22)).w(Math.round(PW * 0.56)).h(Math.round(PH * 0.56))
        .flex().items_center().justify_center()
        .child(div().text_size(13).font_semibold().text_color(hot ? "#f0c060" : TEXT).child("Cast in")));
    const spare = div().id("spare").px(8).py(6).cursor_pointer().text_size(12).text_color(DIM)
      .hover((s) => s.text_color(TEXT)).on_click(() => closeOverlay(props().overlay)).child("Spare it (Esc)");
    return div().id("pit-confirm").relative().w(PANEL_W).h(PANEL_H).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.cast();
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.stop_propagation();
      })
      .child(image(UI + "dialog-panel.png").absolute().left(0).top(0).w(PANEL_W).h(PANEL_H))
      .child(v_flex().absolute().left(34).top(26).w(PANEL_W - 68).gap(8)
        .child(div().text_size(18).font_semibold().text_color(GOLD).child(`Cast ${p.name || "this goblin"} into the pit?`))
        .child(div().text_size(13).text_color(TEXT).child(
          `Its tab closes and the agent ends${runts ? `, with its ${runts} ${runts === 1 ? "runt" : "runts"}` : ""}.`))
        .child(div().text_size(12).text_color(BLOOD).child("Nothing comes back out."))
        .child(h_flex().items_center().justify_end().gap(10).pt(4).child(spare).child(plaque)));
  }
}
