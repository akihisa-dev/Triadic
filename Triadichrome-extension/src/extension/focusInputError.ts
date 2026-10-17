/** Focus without changing the input, then reveal it within the nearest scroll regions. */
export function revealInputError(input: HTMLInputElement | null | undefined) {
  if (!input || input.disabled) return;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: "start", inline: "center", behavior: "instant" });
  // Near the last row, scrolling cannot create space below the cell. Keep the
  // recovery controls available on the other side while this input has focus.
  const layer = document.getElementById("status-notice-layer");
  if (!layer) return;
  const properties = ["top", "bottom", "max-height"] as const;
  const previous = properties.map(property => layer.style.getPropertyValue(property));
  const placeNotices = () => {
    const cell = input.getBoundingClientRect(), notices = layer.getBoundingClientRect();
    if (cell.right <= notices.left || cell.left >= notices.right || cell.bottom <= notices.top || cell.top >= notices.bottom) return;
    const above = Math.max(0, cell.top - 16), below = Math.max(0, innerHeight - cell.bottom - 16);
    const useAbove = above >= below;
    layer.style.top = useAbove ? "auto" : `${cell.bottom + 8}px`;
    layer.style.bottom = useAbove ? `${innerHeight - cell.top + 8}px` : "auto";
    layer.style.maxHeight = `${useAbove ? above : below}px`;
  };
  const frame = requestAnimationFrame(placeNotices);
  const observer = new ResizeObserver(placeNotices);
  observer.observe(layer);
  window.addEventListener("resize", placeNotices);
  window.addEventListener("scroll", placeNotices, true);
  let active = true;
  const onInputBlur = (event: FocusEvent) => {
    // Keep buttons still between pointer-down (which changes focus) and click.
    if (event.relatedTarget instanceof Node && layer.contains(event.relatedTarget)) return;
    cleanup();
  };
  const onNoticeBlur = (event: FocusEvent) => {
    if (event.relatedTarget === input || event.relatedTarget instanceof Node && layer.contains(event.relatedTarget)) return;
    cleanup();
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame); observer.disconnect();
    window.removeEventListener("resize", placeNotices);
    window.removeEventListener("scroll", placeNotices, true);
    input.removeEventListener("blur", onInputBlur);
    layer.removeEventListener("focusout", onNoticeBlur);
    properties.forEach((property, index) => {
      const value = previous[index]!;
      if (value) layer.style.setProperty(property, value);
      else layer.style.removeProperty(property);
    });
  };
  input.addEventListener("blur", onInputBlur);
  layer.addEventListener("focusout", onNoticeBlur);
  return cleanup;
}
