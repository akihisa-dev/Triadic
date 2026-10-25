export type ExpansionScrollMark = {
  id: number; name: string; index: number; target: number; point: number; nameSize: number;
};
export type ExpansionScrollFocus = { id: number; anchor: number } | null;

/** Keep a hovered ID in place while its neighbours yield room for the name. */
export function layoutExpansionScrollMarks(marks: ExpansionScrollMark[], height: number, near: number, active: ExpansionScrollFocus) {
  const entries = marks.map((mark, index) => {
    const previous = marks[index - 1], next = marks[index + 1];
    const dense = !!((previous && mark.point - previous.point < (mark.nameSize + previous.nameSize) / 2 + 4)
      || (next && next.point - mark.point < (mark.nameSize + next.nameSize) / 2 + 4));
    const idSize = Math.min(height, Math.max(14, String(mark.id).length > 2 ? String(mark.id).length * 11 + 6 : 14));
    const baseSize = dense ? idSize : mark.nameSize;
    return { ...mark, dense, baseSize, size: baseSize, position: 0, expanded: false };
  });
  const required = (items: typeof entries) => items.reduce((sum, mark) => sum + mark.baseSize, 0)
    + Math.max(0, items.length - 1) * 2
    + items.reduce((largest, mark) => Math.max(largest, mark.dense ? mark.nameSize - mark.baseSize : 0), 0);
  // Reserve name space before hovering, so opening a label never replaces its neighbours.
  let visible = entries;
  if (required(entries) > height) {
    visible = [];
    for (const mark of [...entries].sort((a, b) => Math.abs(a.point - near) - Math.abs(b.point - near))) {
      if (required([...visible, mark]) <= height) visible.push(mark);
    }
    visible.sort((a, b) => a.index - b.index);
  }
  let edge = 0;
  for (const mark of visible) {
    mark.position = Math.max(edge, Math.min(height - mark.baseSize, mark.point - mark.baseSize / 2));
    edge = mark.position + mark.baseSize + 2;
  }
  let end = height;
  for (const mark of [...visible].reverse()) { mark.position = Math.max(0, Math.min(mark.position, end - mark.baseSize)); end = mark.position - 2; }
  const index = active ? visible.findIndex(mark => mark.id === active.id) : -1;
  if (index >= 0 && visible[index]!.dense) {
    const mark = visible[index]!;
    mark.expanded = true; mark.size = Math.max(mark.baseSize, mark.nameSize);
    const before = visible.slice(0, index).reduce((sum, mark) => sum + mark.baseSize + 2, 0);
    const after = visible.slice(index + 1).reduce((sum, mark) => sum + mark.baseSize + 2, 0);
    mark.position = Math.max(before, Math.min(height - after - mark.size, active!.anchor - mark.size / 2));
    for (let i = index - 1; i >= 0; i--) visible[i]!.position = Math.min(visible[i]!.position, visible[i + 1]!.position - visible[i]!.size - 2);
    for (let i = index + 1; i < visible.length; i++) visible[i]!.position = Math.max(visible[i]!.position, visible[i - 1]!.position + visible[i - 1]!.size + 2);
  }
  return visible;
}
