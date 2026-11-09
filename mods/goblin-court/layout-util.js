// Width taken right of the King's column by visible siblings (the Files/Changes panel when it's open), from the
// live layout tree, so the King's column knows where it is in the window.
export const rightOfKing = (layout) => {
  const find = (n) => {
    const kids = n?.children ?? [];
    const i = kids.findIndex((c) => c.id === "king-corner");
    if (i >= 0) return kids.slice(i + 1).filter((c) => !c.hidden).reduce((w, c) => w + (c.size?.px ?? 0) + (n.gap ?? 0), 0);
    for (const c of kids) { const r = find(c); if (r != null) return r; }
    return null;
  };
  try { return find(layout) ?? 0; } catch (_e) { return 0; }
};
