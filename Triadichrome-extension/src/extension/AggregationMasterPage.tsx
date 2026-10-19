import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Account } from "../core/domain/accountMaster";
import type { Aggregation } from "../core/domain/aggregations";
import type { AggregationChange } from "../core/domain/aggregationMaster";
import { masterRowKey, orderedMasterRows, type MasterRow } from "../core/domain/masterRows";
import { aggregationRanges, placedMasterRows, masterRowSubtree, shiftedMasterRows } from "../core/tables/aggregationLayout";
import { aggregationForbidden } from "../core/tables/aggregationGraph";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { MasterSignSelector } from "./MasterSignSelector";
import { StatusNotice } from "./StatusNotice";
import { useMasterOperation } from "./useMasterOperation";
import { useAutoSave, type AutoSaveProps } from "./useAutoSave";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { liftMasterRow, startMasterPointerDrag, type LiftedMasterRow, type MasterPointerDrag } from "./liftMasterRow";
import { AggregationTrays } from "./AggregationTrays";
import { AggregationDropSlot, type MasterDrop, type MasterDropSlot } from "./AggregationDropSlot";

type Props = AutoSaveProps & { accounts: Account[]; groups: Aggregation[]; isSaving: boolean; onChange: (change: AggregationChange) => Promise<void>; onBack: () => void };

export function AggregationMasterPage({ accounts, groups, isSaving, onChange, onBack, onPendingChange, onPrepareSave }: Props) {
  const readOnly = useHistoryReadOnly();
  const order = useMemo(() => orderedMasterRows(accounts, groups), [accounts, groups]);
  const byRow = useMemo(() => new Map(order.map(row => [masterRowKey(row), row])), [order]);
  const byAccount = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts]);
  const byGroup = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const owners = useMemo(() => new Map(groups.flatMap(group => group.members.map(member => [masterRowKey(member), { parent: group.id, sign: member.sign }] as const))), [groups]);
  const poolRows = useMemo(() => order.filter(row => !owners.has(masterRowKey(row)) && (row.kind === "account" || !byGroup.get(row.id)!.required && !byGroup.get(row.id)!.members.length)), [order, owners, byGroup]);
  const poolKeys = useMemo(() => new Set(poolRows.map(masterRowKey)), [poolRows]);
  const placedRows = useMemo(() => order.filter(row => !poolKeys.has(masterRowKey(row))), [order, poolKeys]);
  const ranges = useMemo(() => aggregationRanges(placedRows, groups), [placedRows, groups]);
  const gutter = Math.max(28, ...ranges.map(range => (range.lane + 1) * 28));
  const [highlight, setHighlight] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dragged, setDragged] = useState<MasterRow | null>(null);
  const [liftedKey, setLiftedKey] = useState<string | null>(null);
  const [liftedHeight, setLiftedHeight] = useState(36);
  const liftedKeys = useMemo(() => liftedKey && byRow.has(liftedKey) ? masterRowSubtree(groups, byRow.get(liftedKey)!) : new Set<string>(), [groups, byRow, liftedKey]);
  const draggedKeys = useMemo(() => dragged ? masterRowSubtree(groups, dragged) : new Set<string>(), [groups, dragged]);
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
  const pool = useRef<HTMLElement>(null);
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
  const { notice, dismiss, save } = useMasterOperation<AggregationChange>({ onChange, successMessage: () => "", onSuccess: change => { if (change.type === "add") { setAdding(false); setName(""); setDisplayName(""); } } });
  const perform = async (change: AggregationChange) => {
    if (disabled) return false;
    setBusy(true);
    try { return await save(change); }
    finally { setBusy(false); }
  };

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
    if (masterRowSubtree(groups, source).has(masterRowKey(target))) return;
    const next = placedMasterRows(order, groups, source, target);
    const saved = perform({ type: "reorder", order: next });
    lifted.current?.settle(saved, table.current?.querySelector<HTMLTableRowElement>(".aggregation-drop-slot:not(.is-closing)"));
    setDragged(null); showDrop(null);
  };

  const pointerTarget = (source: MasterRow, point: { clientX: number; clientY: number }, moving: Set<string>, blocked: Set<number>): MasterDrop | null => {
    const scroller = viewport.current!;
    const hit = scroller.ownerDocument.elementFromPoint(point.clientX, point.clientY);
    if (hit && pool.current?.contains(hit)) {
      setDragVelocity(0);
      return poolKeys.has(masterRowKey(source)) ? null : { key: "unassign", into: true };
    }
    const bounds = scroller.getBoundingClientRect(), edge = 48;
    if (point.clientX < bounds.left || point.clientX > bounds.right || point.clientY < bounds.top || point.clientY > bounds.bottom) {
      setDragVelocity(0); return null;
    }
    setDragVelocity(point.clientY < bounds.top + edge ? -Math.min(14, (bounds.top + edge - point.clientY) / 3)
      : point.clientY > bounds.bottom - edge ? Math.min(14, (point.clientY - bounds.bottom + edge) / 3) : 0);
    const element = hit;
    if (!element || !scroller.contains(element)) return null;
    const slot = element.closest<HTMLTableRowElement>(".aggregation-drop-slot:not(.is-closing)");
    if (slot) return { key: slot.dataset.dropTarget!, into: slot.dataset.dropInto === "true" };
    const vertical = element.closest<HTMLElement>(".aggregation-vertical-name");
    const target = element.closest<HTMLTableRowElement>("tr[data-row]");
    const key = vertical ? `group:${vertical.dataset.groupId}` : target?.dataset.row;
    if (!key || moving.has(key)) return null;
    const candidate = byRow.get(key);
    if (!candidate) return null;
    const into = !!vertical || candidate.kind === "group" && point.clientY > target!.getBoundingClientRect().top + 7;
    if (!into && poolKeys.has(masterRowKey(source))) return null;
    if (into && blocked.has(candidate.id)) return null;
    return { key, into };
  };
  const beginPointer = (handle: HTMLButtonElement, down: PointerEvent, source: MasterRow) => {
    if (disabled || down.button !== 0 || !down.isPrimary) return;
    pointerDrag.current?.destroy(); consumeClick.current = false;
    const moving = masterRowSubtree(groups, source), blocked = aggregationForbidden(byGroup, source);
    let latest = down;
    const clear = () => { pointerRefresh.current = null; setDragVelocity(0); setDragged(null); showDrop(null); };
    const preview = (point: PointerEvent) => {
      latest = point; lifted.current?.move(point);
      const target = pointerTarget(source, point, moving, blocked); showDrop(target?.key ?? null, target?.into ?? false);
    };
    pointerDrag.current = startMasterPointerDrag(handle, down, {
      start: point => {
        lifted.current?.destroy();
        const originalRows = [...(handle.closest("main")!.querySelectorAll<HTMLTableRowElement>("tr[data-row],tr[data-pool-row]"))].filter(node => moving.has(node.dataset.row ?? node.dataset.poolRow!));
        lifted.current = liftMasterRow(handle.closest("tr")!, point, () => { lifted.current = null; setLiftedKey(null); }, () => {
          return [...(table.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]") ?? []), ...(pool.current?.querySelectorAll<HTMLTableRowElement>("tr[data-pool-row]") ?? [])].find(node => moving.has(node.dataset.row ?? node.dataset.poolRow!)) ?? null;
        }, originalRows);
        setLiftedHeight(originalRows.length > 1 ? lifted.current.height : 36);
        setLiftedKey(masterRowKey(source)); setDragged(source); consumeClick.current = true;
        pointerRefresh.current = () => preview(latest);
      },
      move: preview,
      release: point => {
        const target = pointerTarget(source, point, moving, blocked);
        pointerRefresh.current = null; setDragVelocity(0);
        if (target?.key === "unassign") attach(source, null);
        else if (target?.into) attach(source, byGroup.get(Number(target.key.slice("group:".length)))!);
        else if (target && byRow.has(target.key)) reorder(source, byRow.get(target.key)!);
        else { lifted.current?.cancel(); clear(); }
      },
      cancel: () => { lifted.current?.cancel(); clear(); },
    });
  };

  const renderRow = (row: MasterRow, inPool: boolean) => {
    const key = masterRowKey(row), account = row.kind === "account" ? byAccount.get(row.id)! : null, group = row.kind === "group" ? byGroup.get(row.id)! : null;
    const label = account?.accountName ?? group!.name, display = account?.displayName ?? group?.displayName ?? label;
    const owner = owners.get(key), active = highlightedGroup === group?.id, member = owner?.parent === highlightedGroup;
    const slot = dropSlots.find(candidate => candidate.key === key);
    return <Fragment key={key}>
      {slot && <AggregationDropSlot slot={slot} name={draggedName} height={liftedHeight} onClosed={closedKey => setDropSlots(previous => previous.filter(candidate => candidate.key !== closedKey || !candidate.closing))}>
        <span>{draggedName}</span>
        {slot.into && group && <><span aria-hidden="true">→</span><span className="aggregation-slot-destination">{group.name}に所属</span></>}
        <small>{slot.into ? "所属変更" : "行順のみ · 所属は変更しません"}</small>
      </AggregationDropSlot>}
      <tr data-row={inPool ? undefined : key} data-pool-row={inPool ? key : undefined} className={`${group ? `aggregation-subtotal${group.members.length ? "" : " aggregation-empty"}` : ""} ${active ? "is-highlighted" : member ? "is-member" : ""} ${drop?.key === key && drop.into ? "aggregation-drop-into" : ""} ${draggedKeys.has(key) ? "aggregation-drag-source" : ""} ${liftedKeys.has(key) ? "aggregation-lifted-source" : ""}`}
      onClick={() => setHighlight(group?.id ?? owner?.parent ?? null)}>
      <td className="aggregation-gutter" />
      <td className="aggregation-handle-cell"><button type="button" className="text-button aggregation-drag-handle" aria-label={`${label}を移動`} aria-pressed={dragged !== null && masterRowKey(dragged) === key} disabled={disabled} draggable={false}
        onPointerDown={event => beginPointer(event.currentTarget, event.nativeEvent, row)}
        onKeyDown={event => {
          if (event.key === "F2" && group) { event.preventDefault(); editGroup(group); }
          if (event.key === "Escape") { setDragged(null); showDrop(null); }
          if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); attach(row, null); }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault(); const next = shiftedMasterRows(order, groups, row, event.key === "ArrowUp" ? -1 : 1);
            if (next) void perform({ type: "reorder", order: next });
          }
        }} onClick={event => { event.stopPropagation(); if (consumeClick.current) { consumeClick.current = false; return; } if (dragged && group && masterRowKey(dragged) !== key) attach(dragged, group); else setDragged(current => current && masterRowKey(current) === key ? null : row); }}>⠿</button></td>
      <th scope="row" onDoubleClick={() => { if (group) editGroup(group); }}>{editing?.id === group?.id && editing ? <div className="aggregation-inline-edit" onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void finishEdit(); } if (event.key === "Escape" && !autoSave.pending) controller.end(); }}>
        <input autoFocus aria-label={`${label}の集計名`} value={editing.name} disabled={!!group?.required} onChange={event => controller.change({ ...editing, name: event.target.value, displayName: editing.name.trim() === editing.displayName.trim() ? event.target.value : editing.displayName })} />
        <input autoFocus={!!group?.required} aria-label={`${label}の表示名`} value={editing.displayName} onChange={event => controller.change({ ...editing, displayName: event.target.value })} />
        <button type="button" className="text-button" disabled={autoSave.saving} onClick={() => void finishEdit()}>完了</button>
        <button type="button" className="text-button" disabled={autoSave.pending || !!group?.required || !!group?.members.length || !!owner} onClick={() => { controller.end(); setDeleting(group!); }}>削除</button>
      </div> : <>{display}{group && group.name !== display && <span className="aggregation-internal-name">{group.name}</span>}</>}</th>
      <td className="aggregation-sign-cell">{!inPool && <MasterSignSelector name={label} value={owner?.sign ?? null} disabled={disabled || !owner} onChange={sign => perform({ type: "move", member: row, parentId: owner!.parent, sign })} />}</td>
    </tr></Fragment>;

  };

  return <main className="aggregation-master-page master-data-page" data-drop-intent={dragged && drop ? drop.into ? "member" : "order" : undefined} aria-labelledby="aggregation-master-title" aria-busy={isSaving || busy} onCompositionStart={() => controller.pause()} onCompositionEnd={() => controller.resume()}
    onKeyDown={event => { if (event.key === "Escape" && dragged) { event.preventDefault(); event.stopPropagation(); pointerDrag.current?.cancel(); lifted.current?.cancel(); setDragged(null); showDrop(null); } }}>
    <div className="aggregation-master-heading"><div><button className="text-button" type="button" disabled={isSaving || busy || autoSave.pending} onClick={onBack}>← マスタへ戻る</button><h1 id="aggregation-master-title">集計マスタ</h1></div>
      <button className="secondary-button" type="button" disabled={disabled} onClick={() => { dismiss(); setAdding(true); }}>＋ 集計を追加</button></div>
    {adding && <form className="aggregation-add-form" aria-label="集計の新規登録" onSubmit={event => { event.preventDefault(); if (name.trim() && displayName.trim()) void perform({ type: "add", name, displayName }); }}>
      <label>集計名<input autoFocus value={name} disabled={disabled} onChange={event => { const value = event.target.value; if (displayName.trim() === name.trim()) setDisplayName(value); setName(value); }} /></label>
      <label>表示名<input value={displayName} disabled={disabled} onChange={event => setDisplayName(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={disabled || !name.trim() || !displayName.trim()}>登録</button><button className="text-button" type="button" disabled={disabled} onClick={() => setAdding(false)}>キャンセル</button></form>}
    <StatusNotice {...notice} onDismiss={dismiss} />
    <AutoSaveStatus state={autoSave} controller={controller} onPrepareSave={onPrepareSave} />
    <ConfirmationDialog open={deleting !== null} title="集計を削除" message={`「${deleting?.name ?? ""}」を削除しますか？`} confirmLabel="削除する" busy={isSaving || busy} onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting && !disabled) void perform({ type: "delete", id: deleting.id }).then(() => setDeleting(null)); }} />
    <div className="aggregation-workspace">
    <div className="aggregation-grid-scroll" ref={viewport} role="region" aria-label="集計の構成" tabIndex={0}>
      <div className="aggregation-grid-surface" ref={surface} style={{ minWidth: Math.max(500, gutter + 360) }}>
        <AggregationTrays ranges={ranges} slots={dropSlots} table={table} surface={surface} viewport={viewport} highlighted={highlightedGroup} destination={dropGroup} dragged={!!dragged} disabled={disabled} forbidden={forbidden}
          onChoose={id => { if (dragged) attach(dragged, byGroup.get(id)!); else setHighlight(current => current === id ? null : id); }} />
        <table className="aggregation-layout-table" ref={table} aria-label="集計マスタ"><colgroup><col style={{ width: gutter }} /><col style={{ width: 20 }} /><col /><col style={{ width: 76 }} /></colgroup>
          <thead><tr><th scope="col">集計の範囲</th><th scope="col"><span className="sr-only">移動</span></th><th scope="col">科目・集計</th><th scope="col">加減</th></tr></thead>
          <tbody>{placedRows.map(row => renderRow(row, false))}</tbody>
        </table>

      </div>
    </div>
    <aside ref={pool} className={`aggregation-pool${drop?.key === "unassign" ? " is-drop-target" : ""}`} aria-label="未所属プール">
      <h2>未所属<span>{poolRows.length}</span></h2>
      <div className="aggregation-pool-scroll"><table className="aggregation-layout-table aggregation-pool-table" aria-label="未所属の科目・集計">
        <colgroup><col style={{ width: 0 }} /><col style={{ width: 20 }} /><col /><col style={{ width: 0 }} /></colgroup>
        <tbody>{poolRows.map(row => renderRow(row, true))}</tbody>
      </table></div>
      {dragged && <button className="aggregation-unassign" type="button" disabled={disabled || poolKeys.has(masterRowKey(dragged))} onClick={() => attach(dragged, null)}>未所属へ移動</button>}
    </aside>
    </div>
  </main>;
}
