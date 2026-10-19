import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Account } from "../core/domain/accountMaster";
import type { Aggregation } from "../core/domain/aggregations";
import type { AggregationChange } from "../core/domain/aggregationMaster";
import { masterRowKey, orderedMasterRows, type MasterRow } from "../core/domain/masterRows";
import { aggregationRanges, placedMasterRows } from "../core/tables/aggregationLayout";
import { aggregationForbidden } from "../core/tables/aggregationGraph";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { MasterSignSelector } from "./MasterSignSelector";
import { StatusNotice } from "./StatusNotice";
import { useMasterOperation } from "./useMasterOperation";
import { useAutoSave, type AutoSaveProps } from "./useAutoSave";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { liftMasterRow, startMasterPointerDrag, type LiftedMasterRow, type MasterPointerDrag } from "./liftMasterRow";
import { AggregationDropSlot, type MasterDrop, type MasterDropSlot } from "./AggregationDropSlot";

type Props = AutoSaveProps & { accounts: Account[]; groups: Aggregation[]; isSaving: boolean; onChange: (change: AggregationChange) => Promise<void>; onBack: () => void };
type Tray = { key: string; id: number; name: string; x: number; top: number; height: number; path: string };

export function AggregationMasterPage({ accounts, groups, isSaving, onChange, onBack, onPendingChange, onPrepareSave }: Props) {
  const readOnly = useHistoryReadOnly();
  const order = useMemo(() => orderedMasterRows(accounts, groups), [accounts, groups]);
  const byRow = useMemo(() => new Map(order.map(row => [masterRowKey(row), row])), [order]);
  const ranges = useMemo(() => aggregationRanges(order, groups), [order, groups]);
  const gutter = Math.max(28, ...ranges.map(range => (range.lane + 1) * 28));
  const byAccount = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const byGroup = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const owners = useMemo(() => new Map(groups.flatMap(group => group.members.map(member => [masterRowKey(member), { parent: group.id, sign: member.sign }] as const))), [groups]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dragged, setDragged] = useState<MasterRow | null>(null);
  const [liftedKey, setLiftedKey] = useState<string | null>(null);
  const lifted = useRef<LiftedMasterRow | null>(null);
  const pointerDrag = useRef<MasterPointerDrag | null>(null);
  const consumeClick = useRef(false);
  const pointerRefresh = useRef<(() => void) | null>(null);
  const forbidden = useMemo(() => aggregationForbidden(byGroup, dragged), [byGroup, dragged]);
  const [drop, setDrop] = useState<MasterDrop | null>(null);
  const dropRef = useRef<MasterDrop | null>(null);
  const [dropSlots, setDropSlots] = useState<MasterDropSlot[]>([]);
  const showDrop = (key: string | null, into = false) => {
    if (dropRef.current?.key === key && dropRef.current.into === into || !dropRef.current && key === null) return;
    const next = key === null ? null : { key, into };
    dropRef.current = next; setDrop(next);
    setDropSlots(previous => {
      const slots = previous.map(slot => slot.key === key ? { ...slot, into, closing: false } : { ...slot, closing: true });
      if (next && key !== "unassign" && !slots.some(slot => slot.key === key)) slots.push({ ...next, closing: false });
      return slots;
    });
  };
  const [busy, setBusy] = useState(false);
  const autoSave = useAutoSave<{ id: number; name: string; displayName: string }>(draft => onChange({ type: "update", ...draft, members: byGroup.get(draft.id)!.members }), onPendingChange);
  const { draft: editing, controller } = autoSave;
  const [deleting, setDeleting] = useState<Aggregation | null>(null);
  const disabled = readOnly || isSaving || busy || editing !== null;
  const movingRow = dragged ?? (liftedKey ? byRow.get(liftedKey) : null);
  const draggedAccount = movingRow?.kind === "account" ? byAccount.get(movingRow.id) : null;
  const draggedGroup = movingRow?.kind === "group" ? byGroup.get(movingRow.id) : null;
  const draggedName = draggedAccount?.displayName ?? draggedAccount?.accountName ?? draggedGroup?.displayName ?? draggedGroup?.name ?? "";
  const dropGroup = dragged && drop?.into && drop.key.startsWith("group:") ? Number(drop.key.slice("group:".length)) : null;
  const highlightedGroup = dragged ? dropGroup : highlight;
  const editGroup = (group: Aggregation) => { if (!disabled) { dismiss(); controller.begin({ id: group.id, name: group.name, displayName: group.displayName ?? group.name }); } };
  const finishEdit = async () => { await controller.flush(); controller.end(); };
  const surface = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const labelNodes = useRef(new Map<string, HTMLSpanElement>());
  const dragVelocity = useRef(0);
  const dragFrame = useRef(0);
  const setDragVelocity = (speed: number) => {
    dragVelocity.current = speed;
    if (!speed || dragFrame.current) return;
    const scroll = () => {
      dragFrame.current = 0;
      const scroller = viewport.current;
      if (!scroller || !dragVelocity.current) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += dragVelocity.current;
      if (scroller.scrollTop !== before) { pointerRefresh.current?.(); dragFrame.current = requestAnimationFrame(scroll); }
    };
    dragFrame.current = requestAnimationFrame(scroll);
  };
  const [geometry, setGeometry] = useState<{ width: number; height: number; trays: Tray[] }>({ width: 0, height: 0, trays: [] });
  const { notice, dismiss, save } = useMasterOperation<AggregationChange>({ onChange, successMessage: () => "", onSuccess: change => { if (change.type === "add") { setAdding(false); setName(""); } } });
  const perform = async (change: AggregationChange) => {
    if (disabled) return false;
    setBusy(true);
    try { return await save(change); }
    finally { setBusy(false); }
  };

  useLayoutEffect(() => {
    const element = surface.current!, grid = table.current!;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const rows = [...grid.tBodies[0]!.querySelectorAll<HTMLTableRowElement>("tr[data-row]")].map(row => {
        const bounds = row.getBoundingClientRect();
        return { top: bounds.top - rect.top, bottom: bounds.bottom - rect.top };
      });
      const first = grid.tBodies[0]?.querySelector<HTMLTableRowElement>("tr[data-row]");
      const right = first ? first.cells[3]!.getBoundingClientRect().left - rect.left : rect.width;
      const trays = ranges.flatMap(range => range.segments.map((segment, index) => {
        const top = rows[segment.start]!.top, bottom = rows[segment.end]!.bottom;
        const x = range.lane * 28 + 0.5, spine = x + 24;
        const target = segment.groupIndex === null ? null : rows[segment.groupIndex]!;
        // Fill and outline use exactly the same geometry as the table cells.
        const path = target
          ? `M${x} ${top - .5}H${spine}V${target.top - .5}H${right - .5}V${target.bottom - .5}H${spine}V${bottom - .5}H${x}Z`
          : `M${x} ${top - .5}H${spine}V${bottom - .5}H${x}Z`;
        return { key: `${range.id}:${index}`, id: range.id, name: range.name, x, top, height: bottom - top, path };
      }));
      const next = { width: rect.width, height: rect.height, trays };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element); observer.observe(grid);
    return () => observer.disconnect();
  }, [ranges, drop]);

  useLayoutEffect(() => {
    const scroller = viewport.current!, grid = table.current!;
    // Cache intrinsic text sizes. Wheel/drag scrolling only changes transforms,
    // without React renders, table measurements, or rebuilding any L-shaped path.
    const labels = geometry.trays.flatMap(tray => {
      const node = labelNodes.current.get(tray.key);
      return node ? [{ tray, node, height: node.offsetHeight }] : [];
    });
    const headerHeight = grid.tHead?.offsetHeight ?? 24;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.scrollTop + headerHeight, bottom = scroller.scrollTop + scroller.clientHeight;
      for (const { tray, node, height } of labels) {
        const visibleTop = Math.max(top, tray.top), visibleBottom = Math.min(bottom, tray.top + tray.height);
        const y = Math.max(0, Math.min(tray.height - height, (visibleTop + visibleBottom - height) / 2 - tray.top));
        node.style.transform = `translate3d(0,${Math.round(y)}px,0)`;
        node.style.visibility = visibleBottom > visibleTop ? "visible" : "hidden";
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scroller.removeEventListener("scroll", schedule); };
  }, [geometry.trays]);

  useLayoutEffect(() => () => { cancelAnimationFrame(dragFrame.current); dragFrame.current = 0; dragVelocity.current = 0; }, []);
  useLayoutEffect(() => () => { pointerDrag.current?.destroy(); lifted.current?.destroy(); }, []);

  const attach = (source: MasterRow, parent: Aggregation | null) => {
    if (disabled) return;
    if (parent && aggregationForbidden(byGroup, source).has(parent.id)) return;
    const presentationOrder = parent ? placedMasterRows(order, groups, source, { kind: "group", id: parent.id }) : order;
    const saved = perform({ type: "move", member: source, parentId: parent?.id ?? null, sign: owners.get(masterRowKey(source))?.sign ?? 1, presentationOrder });
    lifted.current?.settle(saved, table.current?.querySelector<HTMLTableRowElement>(".aggregation-drop-slot:not(.is-closing)"));
    setDragged(null); showDrop(null);
  };
  const reorder = (source: MasterRow, target: MasterRow) => {
    if (disabled || masterRowKey(source) === masterRowKey(target)) return;
    // Ordering alone never changes membership, even when the row is a group.
    const next = order.filter(row => masterRowKey(row) !== masterRowKey(source));
    next.splice(next.findIndex(row => masterRowKey(row) === masterRowKey(target)), 0, source);
    const saved = perform({ type: "reorder", order: next });
    lifted.current?.settle(saved, table.current?.querySelector<HTMLTableRowElement>(".aggregation-drop-slot:not(.is-closing)"));
    setDragged(null); showDrop(null);
  };

  const pointerTarget = (source: MasterRow, point: { clientX: number; clientY: number }): MasterDrop | null => {
    const scroller = viewport.current!;
    const bounds = scroller.getBoundingClientRect(), edge = 48;
    if (point.clientX < bounds.left || point.clientX > bounds.right || point.clientY < bounds.top || point.clientY > bounds.bottom) {
      setDragVelocity(0); return null;
    }
    setDragVelocity(point.clientY < bounds.top + edge ? -Math.min(14, (bounds.top + edge - point.clientY) / 3)
      : point.clientY > bounds.bottom - edge ? Math.min(14, (point.clientY - bounds.bottom + edge) / 3) : 0);
    const element = scroller.ownerDocument.elementFromPoint(point.clientX, point.clientY);
    if (!element || !scroller.contains(element)) return null;
    if (element.closest(".aggregation-unassign")) return { key: "unassign", into: true };
    const slot = element.closest<HTMLTableRowElement>(".aggregation-drop-slot:not(.is-closing)");
    if (slot) return { key: slot.dataset.dropTarget!, into: slot.dataset.dropInto === "true" };
    const vertical = element.closest<HTMLElement>(".aggregation-vertical-name");
    const target = element.closest<HTMLTableRowElement>("tr[data-row]");
    const key = vertical ? `group:${vertical.dataset.groupId}` : target?.dataset.row;
    if (!key || key === masterRowKey(source)) return null;
    const candidate = byRow.get(key);
    if (!candidate) return null;
    const into = !!vertical || candidate.kind === "group" && point.clientY > target!.getBoundingClientRect().top + 7;
    if (into && aggregationForbidden(byGroup, source).has(candidate.id)) return null;
    return { key, into };
  };
  const beginPointer = (handle: HTMLButtonElement, down: PointerEvent, source: MasterRow) => {
    if (disabled || down.button !== 0 || !down.isPrimary) return;
    pointerDrag.current?.destroy(); consumeClick.current = false;
    let latest = down;
    const clear = () => { pointerRefresh.current = null; setDragVelocity(0); setDragged(null); showDrop(null); };
    const preview = (point: PointerEvent) => {
      latest = point; lifted.current?.move(point);
      const target = pointerTarget(source, point); showDrop(target?.key ?? null, target?.into ?? false);
    };
    pointerDrag.current = startMasterPointerDrag(handle, down, {
      start: point => {
        lifted.current?.destroy();
        lifted.current = liftMasterRow(handle.closest("tr")!, point, () => { lifted.current = null; setLiftedKey(null); });
        setLiftedKey(masterRowKey(source)); setDragged(source); consumeClick.current = true;
        pointerRefresh.current = () => preview(latest);
      },
      move: preview,
      release: point => {
        const target = pointerTarget(source, point);
        pointerRefresh.current = null; setDragVelocity(0);
        if (target?.key === "unassign") attach(source, null);
        else if (target?.into) attach(source, byGroup.get(Number(target.key.slice("group:".length)))!);
        else if (target && byRow.has(target.key)) reorder(source, byRow.get(target.key)!);
        else { lifted.current?.cancel(); clear(); }
      },
      cancel: () => { lifted.current?.cancel(); clear(); },
    });
  };

  return <main className="aggregation-master-page master-data-page" data-drop-intent={dragged && drop ? drop.into ? "member" : "order" : undefined} aria-labelledby="aggregation-master-title" aria-busy={isSaving || busy} onCompositionStart={() => controller.pause()} onCompositionEnd={() => controller.resume()}
    onKeyDown={event => { if (event.key === "Escape" && dragged) { event.preventDefault(); event.stopPropagation(); pointerDrag.current?.cancel(); lifted.current?.cancel(); setDragged(null); showDrop(null); } }}>
    <div className="aggregation-master-heading"><div><button className="text-button" type="button" disabled={isSaving || busy || autoSave.pending} onClick={onBack}>← マスタへ戻る</button><h1 id="aggregation-master-title">集計マスタ</h1></div>
      <button className="secondary-button" type="button" disabled={disabled} onClick={() => { dismiss(); setAdding(true); }}>＋ 集計を追加</button></div>
    {adding && <form className="aggregation-add-form" aria-label="集計の新規登録" onSubmit={event => { event.preventDefault(); if (name.trim()) void perform({ type: "add", name }); }}>
      <label>集計名<input autoFocus value={name} disabled={disabled} onChange={event => setName(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={disabled || !name.trim()}>登録</button><button className="text-button" type="button" disabled={disabled} onClick={() => setAdding(false)}>キャンセル</button></form>}
    <StatusNotice {...notice} onDismiss={dismiss} />
    <AutoSaveStatus state={autoSave} controller={controller} onPrepareSave={onPrepareSave} />
    <ConfirmationDialog open={deleting !== null} title="集計を削除" message={`「${deleting?.name ?? ""}」を削除しますか？`} confirmLabel="削除する" busy={isSaving || busy} onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting && !disabled) void perform({ type: "delete", id: deleting.id }).then(() => setDeleting(null)); }} />
    <div className="aggregation-grid-scroll" ref={viewport} role="region" aria-label="集計の構成" tabIndex={0}>
      <div className="aggregation-grid-surface" ref={surface} style={{ minWidth: Math.max(500, gutter + 360) }}>
        <svg className="aggregation-trays aggregation-tray-fills" aria-hidden="true" width={geometry.width} height={geometry.height}>
          {geometry.trays.map(tray => <path key={tray.key} data-group-id={tray.id} d={tray.path} className={highlightedGroup === tray.id ? "is-highlighted" : undefined} />)}</svg>
        <table className="aggregation-layout-table" ref={table} aria-label="集計マスタ"><colgroup><col style={{ width: gutter }} /><col style={{ width: 20 }} /><col /><col style={{ width: 76 }} /></colgroup>
          <thead><tr><th scope="col">集計の範囲</th><th scope="col"><span className="sr-only">移動</span></th><th scope="col">科目・集計</th><th scope="col">加減</th></tr></thead>
          <tbody>{order.map((row, index) => {
            const key = masterRowKey(row), account = row.kind === "account" ? byAccount.get(row.id)! : null, group = row.kind === "group" ? byGroup.get(row.id)! : null;
            const label = account?.accountName ?? group!.name, display = account?.displayName ?? group?.displayName ?? label;
            const owner = owners.get(key), active = highlightedGroup === group?.id, member = owner?.parent === highlightedGroup;
            const slot = dropSlots.find(candidate => candidate.key === key);
            return <Fragment key={key}>
              {slot && <AggregationDropSlot slot={slot} name={draggedName} onClosed={closedKey => setDropSlots(previous => previous.filter(candidate => candidate.key !== closedKey || !candidate.closing))}>
                <span>{draggedName}</span>
                {slot.into && group && <><span aria-hidden="true">→</span><span className="aggregation-slot-destination">{group.name}に所属</span></>}
                <small>{slot.into ? "所属変更" : "行順のみ · 所属は変更しません"}</small>
              </AggregationDropSlot>}
              <tr data-row={key} className={`${group ? `aggregation-subtotal${group.members.length ? "" : " aggregation-empty"}` : ""} ${active ? "is-highlighted" : member ? "is-member" : ""} ${drop?.key === key && drop.into ? "aggregation-drop-into" : ""} ${dragged && masterRowKey(dragged) === key ? "aggregation-drag-source" : ""} ${liftedKey === key ? "aggregation-lifted-source" : ""}`}
              onClick={() => setHighlight(group?.id ?? owner?.parent ?? null)}>
              <td className="aggregation-gutter" />
              <td className="aggregation-handle-cell"><button type="button" className="text-button aggregation-drag-handle" aria-label={`${label}を移動`} aria-pressed={dragged !== null && masterRowKey(dragged) === key} disabled={disabled} draggable={false}
                onPointerDown={event => beginPointer(event.currentTarget, event.nativeEvent, row)}
                onKeyDown={event => {
                  if (event.key === "F2" && group) { event.preventDefault(); editGroup(group); }
                  if (event.key === "Escape") { setDragged(null); showDrop(null); }
                  if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); attach(row, null); }
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault(); const target = order[index + (event.key === "ArrowUp" ? -1 : 1)];
                    if (target) { const next = [...order]; next.splice(index, 1); next.splice(index + (event.key === "ArrowUp" ? -1 : 1), 0, row); void perform({ type: "reorder", order: next }); }
                  }
                }} onClick={event => { event.stopPropagation(); if (consumeClick.current) { consumeClick.current = false; return; } if (dragged && group && masterRowKey(dragged) !== key) attach(dragged, group); else setDragged(current => current && masterRowKey(current) === key ? null : row); }}>⠿</button></td>
              <th scope="row" onDoubleClick={() => { if (group) editGroup(group); }}>{editing?.id === group?.id && editing ? <div className="aggregation-inline-edit" onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void finishEdit(); } if (event.key === "Escape" && !autoSave.pending) controller.end(); }}>
                <input autoFocus aria-label={`${label}の集計名`} value={editing.name} disabled={!!group?.required} onChange={event => controller.change({ ...editing, name: event.target.value, displayName: editing.name.trim() === editing.displayName.trim() ? event.target.value : editing.displayName })} />
                <input autoFocus={!!group?.required} aria-label={`${label}の表示名`} value={editing.displayName} onChange={event => controller.change({ ...editing, displayName: event.target.value })} />
                <button type="button" className="text-button" disabled={autoSave.saving} onClick={() => void finishEdit()}>完了</button>
                <button type="button" className="text-button" disabled={autoSave.pending || !!group?.required || !!group?.members.length || !!owner} onClick={() => { controller.end(); setDeleting(group!); }}>削除</button>
              </div> : <>{display}{group && group.name !== display && <span className="aggregation-internal-name">{group.name}</span>}</>}</th>
              <td className="aggregation-sign-cell"><MasterSignSelector name={label} value={owner?.sign ?? null} disabled={disabled || !owner} onChange={sign => perform({ type: "move", member: row, parentId: owner!.parent, sign })} /></td>
            </tr></Fragment>;
          })}</tbody>
        </table>
        <svg className="aggregation-trays aggregation-tray-outlines" aria-hidden="true" width={geometry.width} height={geometry.height}>{geometry.trays.map(tray => <path key={tray.key} data-group-id={tray.id} d={tray.path} className={highlightedGroup === tray.id ? "is-highlighted" : undefined} />)}</svg>
        {geometry.trays.map(tray => <button key={tray.key} data-group-id={tray.id} type="button" className={`aggregation-vertical-name${dropGroup === tray.id ? " is-drop-target" : ""}`} style={{ left: tray.x, top: tray.top, height: tray.height }} aria-label={`${tray.name}の範囲${dragged ? "へ移動" : ""}`} aria-pressed={highlightedGroup === tray.id}
          disabled={disabled || (!!dragged && forbidden.has(tray.id))}
          onClick={() => { if (dragged) attach(dragged, byGroup.get(tray.id)!); else setHighlight(current => current === tray.id ? null : tray.id); }}
          ><span className="aggregation-label-text" ref={node => { if (node) labelNodes.current.set(tray.key, node); else labelNodes.current.delete(tray.key); }}>{tray.name}</span></button>)}
      </div>
      {dragged && <button className="aggregation-unassign" type="button" disabled={disabled} onClick={() => attach(dragged, null)}>未所属へ移動</button>}
    </div>
  </main>;
}
