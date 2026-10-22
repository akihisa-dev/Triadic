import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withNodeBundle } from '../scripts/node-bundle.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAG0lEQVR4AWM0ytvynwEPYGIgAJgYCAAmBgIAAC5JAlut5VLxAAAAAElFTkSuQmCC';
const doc = (id = '00000000-0000-4000-8000-000000000001') => ({ id, name: '画像を含む根拠', revision: 0, parts: [
  { id: 'text', kind: 'text', x: 0, y: 0, width: 168, height: 96, text: '根拠\n<実行しない>' },
  { id: 'image', kind: 'image', x: 168, y: 0, width: 336, height: 240, src: image, name: '見積.png' },
  { id: 'table', kind: 'table-horizontal', x: 0, y: 240, width: 1200, height: 192, rowIds: ["monthly-item"], unit: "円", cells: [['単価', ...Array.from({length: 12}, (_, i) => String(i))]] },
  { id: 'vertical', kind: 'table-vertical', x: 1200, y: 0, width: 336, height: 456, rowIds: ["quantity-item"], unit: "人", cells: [['人数', ...Array(12).fill('2\n人')]] },
  { id: 'reference', kind: 'initiative-reference', x: 504, y: 0, width: 336, height: 120, initiativeIdentity: '3'.repeat(32) },
  { id: 'assumption', kind: 'assumption', x: 840, y: 0, width: 336, height: 144, label: '単価差', value: '0010.00', unit: '円／件' },
  { id: 'heading', kind: 'heading', x: 504, y: 120, width: 336, height: 96, text: '算定根拠 <見出し>' },
] });

test('文章・月別表・入力値・反映設定・画像を保存し、取消・履歴・別名保存・競合・失敗でもデータを保つ', async () => {
 await withNodeBundle('tests/core-api.ts', async api => {
  let stored = await api.createTriadicDatabase(2026), writes = 0, fail = false;
  const handle = { name: 'detail.triadic', async getFile() { return new File([stored], this.name); }, async createWritable() {
    let pending; return { async write(bytes) { if (fail) throw new Error('保存失敗'); pending = new Uint8Array(bytes); }, async close() { stored = pending; writes++; }, async abort() {} };
  }};
  const session = new api.PlanSession(); await session.open({ name: handle.name, handle, bytes: stored });
  const destination = async () => handle;
  const change = async (type, document) => session.dispatch({type:'detail', change:{type,document}},destination);
  await change('create',doc());
  assert.deepEqual((await api.readPlanContents(stored)).detailDocuments,[doc()]);
  const update = {...doc(),parts:doc().parts.filter(p=>p.kind !== 'text')};
  await change('update',update);
  assert.equal((await api.readPlanContents(stored)).detailDocuments[0].revision,1);
  await session.travelOperation(-1,destination);
  assert.deepEqual(session.getSnapshot().contents.detailDocuments,[doc()]);
  await session.travelOperation(1,destination);
  assert.equal(session.getSnapshot().contents.detailDocuments[0].parts.length,6);
  await assert.rejects(change('update',{...doc(),name:'古い編集'}),/別の画面/);
  const current = session.getSnapshot().contents.detailDocuments[0];
  const before = stored.slice(), beforeSnapshot = session.getSnapshot();
  fail = true; await assert.rejects(change('update',{...current,name:'保持する入力'}),/保存失敗/);
  assert.deepEqual(stored,before); assert.deepEqual(session.getSnapshot(),beforeSnapshot);
  fail = false; await change('update',{...current,name:'保存済み'});
  const noChange = writes;
  await change('update',session.getSnapshot().contents.detailDocuments[0]); assert.equal(writes,noChange,'同じ内容は保存しない');
  await session.checkpoint(true,destination);
  const status = session.getSnapshot().history;
  const past = await session.preview(status.entries[0].id,destination);
  assert.equal(past.detailDocuments[0].name,'保存済み');
  assert.deepEqual(past.detailDocuments[0].parts,update.parts);
  const comparison = await session.compareHistory(status.entries.at(-1).id);
  assert.ok(JSON.stringify(comparison).includes('明細'));
  assert.ok(!JSON.stringify(comparison).includes('data:image'),'画像の内容を履歴差分の文言へ出さない');
  for (const value of ['参照先がありません', '単価差', '0010.00', '円／件', '算定根拠 <見出し>']) {
    assert.ok(JSON.stringify(comparison).includes(value), `履歴差分に${value}を含む`);
  }
  await session.restore(status.entries.at(-1).id,destination);
  assert.deepEqual(session.getSnapshot().contents.detailDocuments,[],'明細作成前へ復元');
  const cloneDoc = doc('00000000-0000-4000-8000-000000000002'); await change('create',cloneDoc);
  let copy = new Uint8Array();
  const copyHandle = { name:'copy.triadic', isSameEntry:async()=>false, getFile:async()=>new File([copy],'copy.triadic'), createWritable:async()=>({write:async data=>{copy=new Uint8Array(data)},close:async()=>{},abort:async()=>{}}) };
  await session.saveAs(async()=>copyHandle);
  assert.deepEqual((await api.readPlanContents(copy)).detailDocuments,[cloneDoc]);
  assert.ok(copy.length>0);
  // External independent documents merge; overlapping document changes do not overwrite either copy.
  const base=await api.changeDetailDocument(await api.createTriadicDatabase(2026),{type:'create',document:doc()});
  const edited=await api.changeDetailDocument(base,{type:'update',document:{...doc(),name:'ローカル'}});
  const external=await api.changeDetailDocument(base,{type:'create',document:cloneDoc});
  const merged=await api.rebasePlan(base,edited,external); assert.ok(merged);
  assert.deepEqual((await api.readPlanContents(merged.bytes)).detailDocuments.map(d=>d.name),['ローカル',cloneDoc.name]);
  const overlap=await api.changeDetailDocument(base,{type:'update',document:{...doc(),name:'外部'}});
  assert.equal(await api.rebasePlan(base,edited,overlap),null);
 });
});

test('不正な画像参照・明細構造と旧形式を拒否し、元バイト列を変更しない', async () => {
 await withNodeBundle('tests/core-api.ts',async api=>{
  const bytes=await api.createTriadicDatabase(2026), original=bytes.slice();
  for(const document of [
    {...doc(),name:'　'}, {...doc(),id:'bad'}, {...doc(),revision:-1},
    {...doc(),parts:[{...doc().parts[0],x:1}]}, {...doc(),parts:[doc().parts[0],doc().parts[0]]},
    {...doc(),parts:[{...doc().parts[1],src:'https://example.com/image.png'}]},
    {...doc(),parts:[{...doc().parts[1],src:'data:image/svg+xml;base64,PHN2Zy8+'}]},
    {...doc(),parts:[{...doc().parts[1],src:'data:image/png;base64,AAAA'}]},
    {...doc(),parts:[{...doc().parts[2],cells:[['only one']]}]},
    {...doc(),parts:[{...doc().parts[4],initiativeIdentity:1}]},
    {...doc(),parts:[{...doc().parts[4],initiativeIdentity:'missing'}]},
    {...doc(),parts:[{...doc().parts[4],initiativeIdentity:undefined}]},
    {...doc(),parts:[{...doc().parts[5],value:10}]},
    {...doc(),parts:[{...doc().parts[5],unit:null}]},
    {...doc(),parts:[{...doc().parts[6],text:null}]},
    {...doc(),parts:[{...doc().parts[6],unknown:'extra'}]},
  ]) await assert.rejects(api.changeDetailDocument(bytes,{type:'create',document}),/明細/);
  const db=await api.openTriadicDatabase(bytes); db.run('PRAGMA user_version = 27'); const old=db.export(); db.close();
  await assert.rejects(api.openTriadicDatabase(old),/保存形式/);
  const valid=await api.changeDetailDocument(bytes,{type:'create',document:doc()});
  const broken=await api.openTriadicDatabase(valid); broken.run("UPDATE detail_documents SET parts_json = ?",['not json']); const invalid=broken.export(); broken.close();
  await assert.rejects(api.readPlanContents(invalid),/読み込めません/);
  assert.deepEqual(bytes,original);
 });
});

test('画像の読込完了後に発生した編集も、画面移動前の保存待ちに含める', async () => {
 await withNodeBundle('tests/core-api.ts',async api=>{
  const events=[];
  let editPending=false, imagePending=true;
  const controller=(pending,flush)=>({getSnapshot:()=>({draft:null,pending:pending(),saving:false,error:''}),subscribe:()=>()=>{},isComposing:()=>false,flush});
  const stopEditor=api.registerAutoSave(controller(()=>editPending,async()=>{events.push('save');editPending=false}));
  const stopImage=api.registerAutoSave(controller(()=>imagePending,async()=>{await Promise.resolve();events.push('image');editPending=true;imagePending=false}));
  try {await api.flushAutoSaves();assert.deepEqual(events,['image','save']);assert.equal(editPending,false)}
  finally{stopImage();stopEditor()}
 });
});

test('施策参照は改名に追従し、削除・番号再利用・過去閲覧を区別する', async () => {
 await withNodeBundle('Triadichrome-extension/src/extension/DetailOutputPart.tsx', async ({DetailOutputPart}) => {
  const original={id:1,identity:'3'.repeat(32),name:'元の施策',rows:[]};
  const render=(initiatives,extra={})=>renderToStaticMarkup(createElement(DetailOutputPart,{
    part:{...doc().parts[4],initiativeIdentity:original.identity},parts:[],accounts:[],initiatives,disabled:false,navigationBlocked:false,editing:false,
    onEditingChange:()=>{},onChange:()=>{},onOpen:()=>{},...extra,
  }));
  assert.match(render([original]),/元の施策/);
  assert.match(render([{...original,name:'改名後'}]),/改名後/);
  assert.match(render([]),/反映先の施策がありません/);
  const recreated=render([{...original,identity:'4'.repeat(32),name:'番号が同じ別施策'}]);
  assert.match(recreated,/反映先の施策がありません/); assert.doesNotMatch(recreated,/番号が同じ別施策/);
  const past=render([original],{disabled:true});
  assert.match(past,/元の施策/); assert.doesNotMatch(past,/変更|<select|disabled=""/);
  assert.match(render([original],{part:{...doc().parts[4],initiativeIdentity:null}}),/施策を選択/);
 });
});

test('入力値・月別表・内訳・四則演算を正確に計算し、欠落・循環・0除算を区別する', async () => {
 await withNodeBundle('Triadichrome-extension/src/core/domain/detailValues.ts', async api => {
  const input = (id, value) => ({ id, kind:'assumption', label:id, value, unit:'円' });
  const ref = partId => ({partId});
  const parts = [input('a','0.1'),input('b','0.2'),input('three','3'),
   {id:'sum',kind:'calculation',operation:'add',operands:[ref('a'),ref('b')],unit:'千円'},
   {id:'table',kind:'table-horizontal',rowIds:['stable'],unit:'件',cells:[['数量',...Array.from({length:12},(_,i)=>String(i+1))]]},
   {id:'monthly',kind:'calculation',operation:'multiply',operands:[ref('three'),{partId:'table',itemId:'stable'}],unit:'円'},
   {id:'annual',kind:'calculation',operation:'sum',operands:[ref('monthly')],unit:'円'},
   {id:'items',kind:'breakdown',label:'備品',items:[{id:'one',label:'A',quantity:'2',price:'12.5'},{id:'two',label:'B',quantity:'3',price:'10'}]},
  ];
  const evaluate=api.detailEvaluator(parts);
  assert.equal(api.detailYen(evaluate(ref('sum')).value,4,'thousand-yen'),300,'浮動小数点の誤差を生じない');
  assert.equal(api.detailYen(evaluate(ref('monthly')).value,4,'yen'),3);
  assert.equal(api.detailYen(evaluate(ref('monthly')).value,3,'yen'),36);
  assert.equal(api.detailYen(evaluate(ref('annual')).value,4,'yen'),234);
  assert.equal(api.detailYen(evaluate(ref('items')).value,4,'yen'),55);
  assert.equal(api.detailYen(evaluate({partId:'items',itemId:'one'}).value,4,'yen'),25);
  assert.match(evaluate({partId:'table',itemId:'deleted'}).error,/項目がありません/);
  assert.match(evaluate(ref('missing')).error,/パーツがありません/);
  assert.throws(()=>api.detailYen(evaluate(ref('a')).value,4,'yen'),/円未満/);
  const errors = [input('blank',''),input('bad','文字'),input('zero','0'),
   {id:'divide',kind:'calculation',operation:'divide',operands:[ref('three'),ref('zero')],unit:''},
   {id:'cycle',kind:'calculation',operation:'add',operands:[ref('cycle'),ref('three')],unit:''}];
  const invalid=api.detailEvaluator([...parts,...errors]);
  for (const [id, message] of [['blank',/未入力/],['bad',/数値/],['divide',/0で割/],['cycle',/循環/]]) assert.match(invalid(ref(id)).error,message);
  for (const [op, expected] of [['subtract',-1],['multiply',2],['divide',0.5]]) {
   const ev=api.detailEvaluator([input('x','1'),input('y','2'),{id:'c',kind:'calculation',operation:op,operands:[ref('x'),ref('y')],unit:''}]);
   assert.equal(api.detailYen(ev(ref('c')).value,4,'thousand-yen'),expected*1000);
  }
 });
});

test('明細と施策金額を一括保存・取消し、確定手修正・直接入力への切替・競合を守る', async () => {
 await withNodeBundle('tests/core-api.ts', async api => {
  let stored=await api.createSamplePlan(2026);
  const plan=await api.readPlanContents(stored), target=plan.initiatives[0], row=target.rows[0];
  const geometry={x:0,y:0,width:336,height:144};
  const document={id:'00000000-0000-4000-8000-000000000009',name:'金額の根拠',revision:0,parts:[
   {...geometry,id:'input',kind:'assumption',label:'単価',value:'200',unit:'千円'},
   {...geometry,id:'output',kind:'initiative-reference',initiativeIdentity:target.identity,binding:{source:{partId:'input'},rowId:row.id,kindId:1,months:[4,5],unit:'thousand-yen'}}
  ]};
  let fail=false;
  const handle={name:'values.triadic',getFile:async()=>new File([stored],'values.triadic'),createWritable:async()=>{let next;return {write:async bytes=>{if(fail)throw new Error('書込失敗');next=new Uint8Array(bytes)},close:async()=>{stored=next},abort:async()=>{}}}};
  const destination=async()=>handle, session=new api.PlanSession();
  await session.open({name:handle.name,handle,bytes:stored});
  await session.dispatch({type:'detail',change:{type:'create',document}},destination);
  const get=()=>session.getSnapshot().contents, currentRow=()=>get().initiatives[0].rows[0];
  assert.equal(currentRow().amounts[4],'200'); assert.equal(currentRow().amounts[5],'200');
  assert.equal(currentRow().overrides[2][4],row.overrides[2][4],'確定の手修正は保持');
  assert.equal(currentRow().detailSources[1][4].documentId,document.id);
  const boundDraft={...get().initiatives[0],fiscalYear:'2026'};
  assert.equal(api.changeInitiativeCell(boundDraft,1,{row:0,column:0},'99'),boundDraft);
  assert.throws(()=>api.pasteInitiativeGrid(boundDraft,1,{row:0,column:0},'99\t100'),/明細から反映中/);
  assert.equal(boundDraft.rows[0].amounts[4],'200');
  assert.equal(api.resolvedAmount(currentRow(),2,5),'200','手修正のない確定は一次から引継ぐ');
  await session.travelOperation(-1,destination); assert.equal(currentRow().amounts[4],row.amounts[4]);
  assert.equal(get().detailDocuments.some(d=>d.id===document.id),false);
  await session.travelOperation(1,destination); assert.equal(currentRow().amounts[4],'200');
  const update=async transform=>session.dispatch({type:'detail',change:{type:'update',document:transform(get().detailDocuments.find(d=>d.id===document.id))}},destination);
  const before=stored.slice(); fail=true;
  await assert.rejects(update(d=>({...d,parts:d.parts.map(p=>p.id==='input'?{...p,value:'250'}:p)})),/書込失敗/);
  assert.deepEqual(stored,before); assert.equal(currentRow().amounts[4],'200'); fail=false;
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='input'?{...p,value:''}:p)}));
  assert.equal(currentRow().amounts[4],'200'); assert.match(currentRow().detailSources[1][4].error,/未入力/);
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='input'?{...p,value:'0'}:p)}));
  assert.equal(currentRow().amounts[4],'0');
  const saved=get().initiatives[0], draft={...saved,fiscalYear:'2026'};
  await assert.rejects(api.updateInitiative(stored,saved.id,2026,{...draft,rows:draft.rows.map((r,i)=>i? r:{...r,amounts:{...r.amounts,4:'99'}})}),/明細から反映/);
  await assert.rejects(api.updateInitiative(stored,saved.id,2026,{...draft,rows:draft.rows.slice(1)}),/変更・削除/);
  await assert.rejects(api.changeDetailDocument(stored,{type:'create',document:{...document,id:'00000000-0000-4000-8000-000000000010'}}),/複数の明細/);
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='output'?{...p,binding:{...p.binding,months:[5]}}:p)}));
  assert.equal(currentRow().amounts[4],'0'); assert.equal(currentRow().detailSources[1][4],undefined);
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='input'?{...p,value:'300'}:p)}));
  assert.equal(currentRow().amounts[4],'0'); assert.equal(currentRow().amounts[5],'300');
  const now=get().initiatives[0];
  await session.dispatch({type:'initiative.update',id:now.id,draft:{...now,fiscalYear:'2026',rows:now.rows.map((r,i)=>i?r:{...r,amounts:{...r.amounts,4:'77'}})}},destination);
  assert.equal(currentRow().amounts[4],'77'); assert.equal(currentRow().amounts[5],'300');
  assert.equal(api.duplicateInitiativeDraft(get().initiatives[0],[]).rows[0].detailSources,undefined,'複製は値を持つ独立した施策');
  const local=await api.changeDetailDocument(stored,{type:'update',document:{...get().detailDocuments.find(d=>d.id===document.id),parts:get().detailDocuments.find(d=>d.id===document.id).parts.map(p=>p.id==='input'?{...p,value:'400'}:p)}});
  const db=await api.openTriadicDatabase(stored); db.run('UPDATE initiative_amounts SET amount_yen = 1 WHERE row_id = ? AND kind_id = 1 AND month = 5',[row.id]); const invalid=db.export();db.close();
  await assert.rejects(api.readPlanContents(invalid),/読み込めません/);
  assert.equal((await api.readPlanContents(local)).initiatives[0].rows[0].amounts[5],'400');
 });
});

test('0円の反映先と同時の科目変更・削除、別明細からの重複接続を両保存順で拒否する', async () => {
 await withNodeBundle('tests/core-api.ts', async api => {
  const base=await api.createSamplePlan(2026), plan=await api.readPlanContents(base);
  const target=plan.initiatives.find(i=>i.name==='科目変更と削除の確認'), row=target.rows[0];
  const document={id:'00000000-0000-4000-8000-000000000011',name:'0円も連動',revision:0,parts:[
   {id:'input',kind:'assumption',x:0,y:0,width:336,height:144,label:'値',value:'0',unit:'円'},
   {id:'output',kind:'initiative-reference',x:360,y:0,width:432,height:600,initiativeIdentity:target.identity,binding:{source:{partId:'input'},rowId:row.id,kindId:1,months:[4],unit:'yen'}}
  ]};
  const linked=await api.changeDetailDocument(base,{type:'create',document});
  const changed=await api.updateInitiative(base,target.id,2026,{...target,fiscalYear:'2026',rows:target.rows.map((r,i)=>i?r:{...r,accountId:plan.accounts.find(a=>a.id!==r.accountId).id})});
  const deleted=await api.updateInitiative(base,target.id,2026,{...target,fiscalYear:'2026',rows:target.rows.slice(1)});
  for(const external of [changed,deleted]) {
   assert.equal(await api.rebasePlan(base,linked,external),null);
   assert.equal(await api.rebasePlan(base,external,linked),null);
  }
  const duplicate=await api.changeDetailDocument(base,{type:'create',document:{...document,id:'00000000-0000-4000-8000-000000000012',name:'別の根拠'}});
  assert.equal(await api.rebasePlan(base,linked,duplicate),null);
  assert.equal(await api.rebasePlan(base,duplicate,linked),null);
  const unrelated=await api.changeDetailDocument(base,{type:'update',document:{...plan.detailDocuments[0],name:'説明だけを更新'}});
  assert.ok(await api.rebasePlan(base,linked,unrelated));
  assert.deepEqual((await api.readPlanContents(base)).initiatives.find(i=>i.id===target.id).rows[0],row);
 });
});

test('確定への反映が未入力でも、結び付けた時点の引継ぎ額を保持し、施策名と一次予算を編集できる', async () => {
 await withNodeBundle('tests/core-api.ts', async api => {
  let bytes=await api.createSamplePlan(2026), plan=await api.readPlanContents(bytes);
  const initiative=plan.initiatives[0], row=initiative.rows[0], inherited=row.amounts[5];
  assert.equal(row.overrides[2][5],undefined);
  const geometry={x:0,y:0,width:336,height:144};
  const document={id:'00000000-0000-4000-8000-000000000013',name:'確定の根拠',revision:0,parts:[
   {...geometry,id:'initial',kind:'assumption',label:'一次',value:'200',unit:'千円'},
   {...geometry,id:'confirmed',kind:'assumption',label:'確定',value:'',unit:'千円'},
   {...geometry,id:'initial-output',kind:'initiative-reference',initiativeIdentity:initiative.identity,binding:{source:{partId:'initial'},rowId:row.id,kindId:1,months:[5],unit:'thousand-yen'}},
   {...geometry,id:'confirmed-output',kind:'initiative-reference',initiativeIdentity:initiative.identity,binding:{source:{partId:'confirmed'},rowId:row.id,kindId:2,months:[5],unit:'thousand-yen'}},
  ]};
  bytes=await api.changeDetailDocument(bytes,{type:'create',document});
  plan=await api.readPlanContents(bytes);
  assert.equal(plan.initiatives[0].rows[0].amounts[5],'200');
  assert.equal(plan.initiatives[0].rows[0].overrides[2][5],inherited,'同時の一次更新より前の確定額を保持');
  assert.match(plan.initiatives[0].rows[0].detailSources[2][5].error,/未入力/);
  bytes=await api.updateInitiative(bytes,initiative.id,2026,{...plan.initiatives[0],fiscalYear:'2026',name:'名前は編集できる'});
  const current=(await api.readPlanContents(bytes)).detailDocuments.find(d=>d.id===document.id);
  bytes=await api.changeDetailDocument(bytes,{type:'update',document:{...current,parts:current.parts.map(p=>p.id==='initial'?{...p,value:'300'}:p)}});
  plan=await api.readPlanContents(bytes);
  assert.equal(plan.initiatives[0].rows[0].amounts[5],'300');
  assert.equal(plan.initiatives[0].rows[0].overrides[2][5],inherited);
  const next=plan.detailDocuments.find(d=>d.id===document.id);
  bytes=await api.changeDetailDocument(bytes,{type:'update',document:{...next,parts:next.parts.map(p=>p.id==='confirmed'?{...p,value:'400'}:p)}});
  plan=await api.readPlanContents(bytes);
  assert.equal(plan.initiatives[0].rows[0].amounts[5],'300');assert.equal(plan.initiatives[0].rows[0].overrides[2][5],'400');
  const history=await api.readDataHistory(bytes);
  assert.match(JSON.stringify(await api.compareSavedHistory(bytes,history.entries.at(-1).id)),/明細から反映：確定の根拠/);
 });
});

test('月別表は選択月だけを計算し、項目の並べ替え・削除で別の値へ参照を移さない', async () => {
 await withNodeBundle('tests/core-api.ts', async api => {
  let bytes=await api.createSamplePlan(2026);const plan=await api.readPlanContents(bytes),target=plan.initiatives[0],row=target.rows[0];
  const geometry={x:0,y:0,width:336,height:144};
  const document={id:'00000000-0000-4000-8000-000000000014',name:'必要な月だけ反映',revision:0,parts:[
   {...geometry,id:'monthly',kind:'table-horizontal',width:1200,height:192,rowIds:['other','selected'],unit:'件',cells:[['別の項目',...Array(12).fill('999')],['反映する項目','10',...Array(11).fill('')]]},
   {...geometry,id:'price',kind:'assumption',label:'単価',value:'2',unit:'千円／件'},
   {...geometry,id:'calculation',kind:'calculation',label:'月額',operation:'multiply',operands:[{partId:'monthly',itemId:'selected'},{partId:'price'}],unit:'千円'},
   {...geometry,id:'output',kind:'initiative-reference',initiativeIdentity:target.identity,binding:{source:{partId:'calculation'},rowId:row.id,kindId:1,months:[4],unit:'thousand-yen'}}
  ]};
  bytes=await api.changeDetailDocument(bytes,{type:'create',document});
  const read=async()=>api.readPlanContents(bytes);
  const update=async transform=>{const d=(await read()).detailDocuments.find(d=>d.id===document.id);bytes=await api.changeDetailDocument(bytes,{type:'update',document:transform(d)})};
  assert.equal((await read()).initiatives[0].rows[0].amounts[4],'20','対象外の空欄月は反映を妨げない');
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='monthly'?{...p,rowIds:[...p.rowIds].reverse(),cells:[...p.cells].reverse()}:p)}));
  assert.equal((await read()).initiatives[0].rows[0].amounts[4],'20');
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='output'?{...p,binding:{...p.binding,months:[4,5]}}:p)}));
  assert.equal((await read()).initiatives[0].rows[0].amounts[4],'20');
  assert.equal((await read()).initiatives[0].rows[0].amounts[5],row.amounts[5],'選択した5月が未入力なら一括して前の金額を保持');
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='monthly'?{...p,cells:p.cells.map((r,i)=>i===0?[r[0],'30','40',...r.slice(3)]:r)}:p)}));
  let current=(await read()).initiatives[0].rows[0];assert.equal(current.amounts[4],'60');assert.equal(current.amounts[5],'80');
  await update(d=>({...d,parts:d.parts.map(p=>p.id==='monthly'?{...p,rowIds:p.rowIds.slice(1),cells:p.cells.slice(1)}:p)}));
  current=(await read()).initiatives[0].rows[0];assert.equal(current.amounts[4],'60');assert.equal(current.amounts[5],'80');
  assert.match(current.detailSources[1][4].error,/項目がありません/);
 });
});

test('失われた施策の反映設定は、同じ行識別子を持つ別施策を変更・ロックしない', async () => {
 await withNodeBundle('tests/core-api.ts', async api => {
  let bytes=await api.createSamplePlan(2026),plan=await api.readPlanContents(bytes);const target=plan.initiatives[0],row=target.rows[0];
  const geometry={x:0,y:0,width:336,height:144};
  const document={id:'00000000-0000-4000-8000-000000000015',name:'参照消失の根拠',revision:0,parts:[
   {...geometry,id:'value',kind:'assumption',label:'値',value:'1000',unit:'千円'},
   {...geometry,id:'lost',kind:'initiative-reference',initiativeIdentity:'f'.repeat(32),binding:{source:{partId:'value'},rowId:row.id,kindId:1,months:[4],unit:'thousand-yen'}}
  ]};
  bytes=await api.changeDetailDocument(bytes,{type:'create',document});plan=await api.readPlanContents(bytes);
  assert.equal(plan.initiatives[0].rows[0].amounts[4],row.amounts[4]);assert.equal(plan.initiatives[0].rows[0].detailSources,undefined);
  bytes=await api.updateInitiative(bytes,target.id,2026,{...plan.initiatives[0],fiscalYear:'2026',rows:plan.initiatives[0].rows.map((r,i)=>i?r:{...r,amounts:{...r.amounts,4:'777'}})});
  const current=(await api.readPlanContents(bytes)).detailDocuments.find(d=>d.id===document.id);
  bytes=await api.changeDetailDocument(bytes,{type:'update',document:{...current,parts:[...current.parts,{...document.parts[1],id:'valid',initiativeIdentity:target.identity}]}});
  plan=await api.readPlanContents(bytes);assert.equal(plan.initiatives[0].rows[0].amounts[4],'1000');assert.equal(plan.initiatives[0].rows[0].detailSources[1][4].partId,'valid');
 });
});
