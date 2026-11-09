// Goblin Keep: a name prompt in the hall's look (the "+ New clan" banner opens it). Borderless dialog:
// the torn parchment panel (art/ui/dialog-panel.png, Documents/GoblinKing/ui/build_dialog.py), gold title,
// a dark inset field, the goblin plaque as the button. Enter saves, Esc cancels.
// props: { title, value?, hint?, action?, command: { name, args } } -> run(command.name, { ...args, name }).
// Open it at PANEL_W x PANEL_H with frame "none".
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay } from "herdr";

const UI = "mods/goblin-court/art/ui/";
const GOLD = "#bca251", TEXT = "#e6dcbe", DIM = "#a8987a", WELL = "#1a130c", RIM = "#5a4026";
export const PANEL_W = 442, PANEL_H = 252;     // dialog-panel.png (316x180, shadow included) at x1.4
const PW = 158, PH = 66;                        // pit-plaque.png (126x53) at x1.25

export default class GoblinPrompt extends View {
  init(_props, cx) {
    this.text = props()?.value ?? "";
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submit() {
    const p = props();
    closeOverlay(p.overlay);
    run(p.command.name, { ...(p.command.args ?? {}), name: this.text });
  }

  render() {
    const p = props() ?? {};
    const hot = !!this.hot;
    const plaque = div().id("gp-save").relative().w(PW).h(PH).cursor_pointer()
      .on_hover((h, cx) => { this.hot = h; cx.notify(); })
      .on_click(() => this.submit())
      .child(image(UI + `pit-plaque${hot ? "-hover" : ""}.png`).absolute().left(0).top(0).w(PW).h(PH))
      .child(div().absolute().left(Math.round(PW * 0.27)).top(Math.round(PH * 0.22)).w(Math.round(PW * 0.56)).h(Math.round(PH * 0.56))
        .flex().items_center().justify_center()
        .child(div().text_size(13).font_semibold().text_color(hot ? "#f0c060" : TEXT).child(p.action ?? "Raise it")));
    const cancel = div().id("gp-cancel").px(8).py(6).cursor_pointer().text_size(12).text_color(DIM)
      .hover((s) => s.text_color(TEXT)).on_click(() => closeOverlay(p.overlay)).child("Never mind (Esc)");
    return div().id("goblin-prompt").relative().w(PANEL_W).h(PANEL_H).track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(image(UI + "dialog-panel.png").absolute().left(0).top(0).w(PANEL_W).h(PANEL_H))
      .child(v_flex().absolute().left(34).top(26).w(PANEL_W - 68).gap(10)
        .child(div().text_size(18).font_semibold().text_color(GOLD).child(p.title ?? ""))
        .child(Input.new(this.input).h(36).px(10).rounded(2).border(2)
          .border_color(this.inputFocused ? GOLD : RIM).bg(WELL).text_size(14).text_color(TEXT))
        .when(Boolean(p.hint), (el) => el.child(div().text_size(11.5).text_color(DIM).child(p.hint)))
        .child(h_flex().items_center().justify_end().gap(10).child(cancel).child(plaque)));
  }
}
