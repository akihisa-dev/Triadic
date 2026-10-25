import { useTableCellFilter } from "./TableCellFilter";
import { TableViewHeader, useTableView, useEditingTableRows } from "./TableViewHeader";
import type { TableColumn } from "../core/tables/columnView";
import { useLayoutEffect, useRef, useState } from "react";
import { type Account, type AccountChange } from "../core/domain/accountMaster";
import { type Aggregation } from "../core/domain/aggregations";
import { type AggregationChange } from "../core/domain/aggregationMaster";
import { accountTypes, type AccountType } from "../core/domain/accountTypes";
import { masterRowKey, orderedMasterRows, type MasterRow } from "../core/domain/masterRows";
import { useHistoryReadOnly } from "./HistoryReadOnly";
import { useMasterOperation } from "./useMasterOperation";
import { useAutoSave, type AutoSaveProps } from "./useAutoSave";
import { AutoSaveStatus } from "./AutoSaveStatus";
import { StatusNotice } from "./StatusNotice";
import { ConfirmationDialog } from "./ConfirmationDialog";

type Props = AutoSaveProps & { accounts: Account[]; groups: Aggregation[]; usedAccountIds: Set<number>; isSaving: boolean; onChange: (change: AccountChange) => Promise<void>; onChangeAggregations: (change: AggregationChange) => Promise<void>; onBack: () => void };
type Draft = MasterRow & { code: string; name: string; displayName: string; attribute: AccountType | "" };
type Operation = {kind:"account"; change:AccountChange} | {kind:"group"; change:AggregationChange};

export function AccountMasterPage({ accounts, groups, usedAccountIds, isSaving, onChange, onChangeAggregations, onBack, onPendingChange, onPrepareSave }: Props) {
  const readOnly = useHistoryReadOnly();
  const rows = orderedMasterRows(accounts,groups);
  const byAccount = new Map(accounts.map(item => [item.id,item]));
  const accountRows = rows.filter(row => row.kind === "account");
  const empty = (): Draft => ({kind:"account",id:0,code:"",name:"",displayName:"",attribute:""});
  const [adding,setAdding] = useState<Draft>(empty);
  const [deleting,setDeleting] = useState<MasterRow | null>(null);
  const [dragged,setDragged] = useState<MasterRow | null>(null);
  const [drop,setDrop] = useState<{key:string;before:boolean} | null>(null);
  const elements = useRef(new Map<string,HTMLTableRowElement>());
  const keyboardFocus = useRef<{ key: string; button: HTMLButtonElement } | null>(null);
  const positions = useRef<Map<string,number> | null>(null);
  const focus = (row: MasterRow) => requestAnimationFrame(() => elements.current.get(masterRowKey(row))?.querySelector<HTMLButtonElement>("[data-edit]")?.focus({preventScroll:true}));
  const changeAccount = (change:AccountChange) => onChange({...change,presentationOrder:rows});
  const changeGroup = (change:AggregationChange) => onChangeAggregations({...change,presentationOrder:rows});
  const perform = (operation: Operation) => operation.kind === "account" ? changeAccount(operation.change) : changeGroup(operation.change);
  const autoSave = useAutoSave<Draft>(draft => changeAccount({type:"update",id:draft.id,accountCode:draft.code,accountName:draft.name,accountType:draft.attribute,displayName:draft.displayName}),onPendingChange);
  const {draft:editing,controller} = autoSave;
  const savedSource = useRef<string | null>(null);
  const retained = useRef<Account | null>(null);
  useLayoutEffect(() => {
    if (!editing) { savedSource.current = null; retained.current = null; return; }
    const account = accounts.find(item => item.id === editing.id);
    if (!account) { controller.sourceMissing(); return; }
    const saved: Draft = { kind: "account", id: account.id, code: account.accountCode ?? "", name: account.accountName,
      displayName: account.displayName ?? account.accountName, attribute: account.accountType ?? "" };
    const key = JSON.stringify(saved);
    if (key === savedSource.current) return;
    savedSource.current = key;
    controller.syncSaved(saved);
    if (!controller.hasSourceChange()) retained.current = account;
  }, [accounts, controller, editing?.id]);
  const protectedInput = autoSave.pending && !!editing && (controller.hasSourceChange() || !byAccount.has(editing.id));
  const {notice,dismiss,save} = useMasterOperation<Operation>({onChange:perform,onSuccess:operation => { if(operation.change.type === "add") setAdding(empty()); setDeleting(null); },onFailure:() => {positions.current=null;setDeleting(null);},successMessage:() => "マスタを保存しました。",cancelledMessage:() => "保存をキャンセルしました。元の内容を保っています。"});
  const columns: TableColumn<MasterRow>[] = [
    { id: "code", label: "科目コード", value: row => byAccount.get(row.id)?.accountCode },
    { id: "name", label: "名称", value: row => byAccount.get(row.id)?.accountName },
    { id: "display", label: "表示名", value: row => { const account = byAccount.get(row.id)!; return account.displayName ?? account.accountName; } },
    { id: "type", label: "科目属性", type: "choice", value: row => { const type = byAccount.get(row.id)?.accountType; return type ? accountTypes[type] : "未設定"; } },
  ];
  const tableView = useTableView(accountRows, columns);
  const cellFilter = useTableCellFilter(tableView, !!editing || isSaving);
  const editorRows = protectedInput && retained.current
    ? [...accountRows.filter(row => row.id !== editing!.id), { kind: "account" as const, id: editing!.id }] : accountRows;
  const displayed = useEditingTableRows(tableView.rows, editorRows, editing ? masterRowKey(editing) : null, masterRowKey);
  const presentationChanged = tableView.filtered || !!tableView.state.sort;
  const disabled = readOnly || isSaving || editing !== null;
  useLayoutEffect(() => {
    if (disabled || !keyboardFocus.current) return;
    const { key, button } = keyboardFocus.current;
    keyboardFocus.current = null;
    if (document.activeElement !== document.body && document.activeElement !== button) return;
    elements.current.get(key)?.querySelector<HTMLButtonElement>(".account-drag-handle:not(:disabled)")?.focus({ preventScroll: true });
  }, [disabled, accounts, groups]);
  useLayoutEffect(() => {
    if (!positions.current) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key,element] of elements.current) {
      const previous=positions.current.get(key); if(previous === undefined) continue;
      const delta=previous-element.getBoundingClientRect().top;
      if(delta) element.animate(reduced ? [{opacity:.5},{opacity:1}] : [{transform:`translateY(${delta}px)`},{transform:"translateY(0)"}], {duration:reduced ? 80 : 220,easing:"ease-out"});
    }
    positions.current=null;
  },[accounts,groups]);
  const reorder = (row:MasterRow,target:MasterRow,before:boolean) => {
    if(disabled || presentationChanged || masterRowKey(row) === masterRowKey(target)) return;
    const order=rows.filter(item => masterRowKey(item) !== masterRowKey(row));
    order.splice(order.findIndex(item => masterRowKey(item) === masterRowKey(target))+(before ? 0 : 1),0,row);
    if(order.every((item,index) => masterRowKey(item) === masterRowKey(rows[index]!))) return;
    positions.current=new Map([...elements.current].map(([key,element]) => [key,element.getBoundingClientRect().top]));
    void save({kind:"group",change:{type:"reorder",order}});
    return true;
  };
  const rename = (draft:Draft,name:string) => ({...draft,name,displayName:draft.displayName.trim() === draft.name.trim() ? name : draft.displayName});
  const end = () => {if(editing) focus(editing);controller.end();dismiss();};
  return <main className="master-page account-master-page master-data-page unified-master-page" aria-labelledby="account-master-title" aria-busy={isSaving} onCompositionStart={() => controller.pause()} onCompositionEnd={() => controller.resume()}>
    <div className="account-master-heading"><button type="button" className="text-button master-back" disabled={isSaving || autoSave.pending} onClick={onBack}>← マスタへ戻る</button><h1 id="account-master-title">勘定科目マスタ</h1><span className="master-count">{tableView.filtered ? `${displayed.length} / ${accounts.length}` : accounts.length}科目</span></div>
    <form className="account-master-form" aria-label="勘定科目の新規登録" onSubmit={event => {event.preventDefault();if(disabled) return;void save({kind:"account",change:{type:"add",accountCode:adding.code,accountName:adding.name,accountType:adding.attribute,displayName:adding.displayName}});}}>
      <span className="master-form-label">新規登録</span>
      <div className="initiative-field account-code-field"><label htmlFor="account-code">科目コード</label><input name="accountCode" id="account-code" value={adding.code} disabled={disabled} inputMode="numeric" autoComplete="off" onChange={event => setAdding({...adding,code:event.target.value})}/></div>
      <div className="initiative-field"><label htmlFor="account-name">名称</label><input name="accountName" id="account-name" value={adding.name} disabled={disabled} autoComplete="off" onChange={event => setAdding(rename(adding,event.target.value))}/></div>
      <div className="initiative-field"><label htmlFor="master-display-name">表示名</label><input id="master-display-name" value={adding.displayName} disabled={disabled} autoComplete="off" onChange={event => setAdding({...adding,displayName:event.target.value})}/></div>
      <div className="initiative-field account-type-field"><label htmlFor="account-type">科目属性</label><select id="account-type" value={adding.attribute} disabled={disabled} onChange={event => setAdding({...adding,attribute:event.target.value as Draft["attribute"]})}><option value="">属性を選択</option>{Object.entries(accountTypes).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="form-actions"><button className="primary-button" type="submit" disabled={disabled || !adding.name.trim() || !adding.displayName.trim() || !adding.code.trim() || !adding.attribute}>登録</button></div>
    </form>
    <StatusNotice {...notice} onDismiss={dismiss}/>
    <AutoSaveStatus state={autoSave} controller={controller} onPrepareSave={onPrepareSave}/>
    <ConfirmationDialog open={deleting !== null} title="勘定科目を削除" message={deleting ? `「${byAccount.get(deleting.id)?.accountCode} ${byAccount.get(deleting.id)?.accountName}」を削除しますか？` : ""} confirmLabel="削除する" busy={isSaving} onCancel={() => setDeleting(null)} onConfirm={() => {if(deleting && !isSaving) void save({kind:"account",change:{type:"delete",id:deleting.id}});}}/>
    <div className="account-master-list" role="region" aria-label="勘定科目一覧" tabIndex={0}><table className="account-master-table" aria-label="勘定科目一覧"><thead><tr><th scope="col">順序</th>{columns.map(column => <TableViewHeader key={column.id} view={tableView} column={column.id} disabled={!!editing || isSaving} />)}<th scope="col">操作</th></tr></thead><tbody>
      {displayed.length === 0 && <tr><td colSpan={6} className="table-view-empty">条件に合う行がありません。</td></tr>}
      {displayed.map((row,index) => {
        const key=masterRowKey(row),account=(protectedInput && row.id === editing?.id ? retained.current : byAccount.get(row.id))!;
        const name=account.accountName;
        const draft=editing && masterRowKey(editing) === key ? editing : null;
        const cannotDelete=account.inUse || usedAccountIds.has(account.id);
        return <tr key={key} ref={element => {if(element) elements.current.set(key,element);else elements.current.delete(key);}} className={`${draft ? "master-row-editing" : ""} ${drop?.key === key ? drop.before ? "drop-before" : "drop-after" : ""}`} onDragOver={event => {if(!dragged || disabled) return;event.preventDefault();setDrop({key,before:event.clientY < event.currentTarget.getBoundingClientRect().top+event.currentTarget.getBoundingClientRect().height/2});}} onDrop={event => {event.preventDefault();if(dragged && drop) reorder(dragged,row,drop.before);setDragged(null);setDrop(null);}} onKeyDown={event => {if(draft && event.key === "Escape" && !autoSave.pending){event.preventDefault();event.stopPropagation();end();}}}>
          <td><button type="button" className="text-button account-drag-handle" aria-label={`${name}を並べ替え`} disabled={disabled || presentationChanged} title={presentationChanged ? "表示の絞り込みと並べ替えを解除すると登録順を変更できます。" : undefined} draggable={!disabled && !presentationChanged} onDragStart={event => {event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",key);setDragged(row);}} onDragEnd={() => {setDragged(null);setDrop(null);}} onKeyDown={event => {if(event.key !== "ArrowUp" && event.key !== "ArrowDown") return;event.preventDefault();const target=accountRows[index+(event.key === "ArrowUp" ? -1 : 1)];if(target && reorder(row,target,event.key === "ArrowUp")) keyboardFocus.current={key,button:event.currentTarget};}}>⠿</button></td>
          <td className="account-code">{draft ? <input readOnly={protectedInput} autoFocus aria-label={`${name}の科目コード`} value={draft.code} inputMode="numeric" onChange={event => controller.change({...draft,code:event.target.value})}/> : account.accountCode}</td>
          <th {...cellFilter.props("name", name)} scope="row">{draft && protectedInput && <span className="field-hint">{name}</span>}{draft ? <input readOnly={protectedInput} aria-label={`${name}の名称`} value={draft.name} onChange={event => controller.change(rename(draft,event.target.value))}/> : name}</th>
          <td {...cellFilter.props("display", account.displayName ?? name)}>{draft ? <input readOnly={protectedInput} aria-label={`${name}の表示名`} value={draft.displayName} onChange={event => controller.change({...draft,displayName:event.target.value})}/> : account.displayName ?? name}</td>
          <td {...cellFilter.props("type", account.accountType ? accountTypes[account.accountType] : "未設定")}>{draft ? <select disabled={protectedInput} aria-label={`${name}の科目属性`} value={draft.attribute} onChange={event => controller.change({...draft,attribute:event.target.value as Draft["attribute"]})}><option value="">属性を選択</option>{Object.entries(accountTypes).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className="master-type-badge">{account.accountType ? accountTypes[account.accountType] : "未設定"}</span>}</td>
          <td><div className="form-actions">{draft ? <button type="button" className="text-button" disabled={autoSave.pending} onClick={end}>完了</button> : <><button type="button" data-edit className="text-button" aria-label={`${name}を編集`} disabled={disabled} onClick={() => {dismiss();retained.current=account;controller.begin({...row,code:account.accountCode ?? "",name,displayName:account.displayName ?? name,attribute:account.accountType ?? ""});}}>編集</button><button type="button" className="text-button" aria-label={`${name}を削除`} disabled={disabled || cannotDelete} onClick={() => {dismiss();setDeleting(row);}}>削除</button></>}</div></td>
        </tr>;
      })}
    </tbody></table></div>
  {cellFilter.menu}
  </main>;
}
