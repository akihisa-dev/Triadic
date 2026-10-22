import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withNodeBundle } from '../scripts/node-bundle.mjs';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAG0lEQVR4AWM0ytvynwEPYGIgAJgYCAAmBgIAAC5JAlut5VLxAAAAAElFTkSuQmCC';
const doc = (id = '00000000-0000-4000-8000-000000000001') => ({ id, name: '画像を含む根拠', revision: 0, parts: [
  { id: 'text', kind: 'text', x: 0, y: 0, width: 168, height: 96, text: '根拠\n<実行しない>' },
  { id: 'image', kind: 'image', x: 168, y: 0, width: 336, height: 240, src: image, name: '見積.png' },
  { id: 'table', kind: 'table-horizontal', x: 0, y: 240, width: 1200, height: 192, cells: [['単価', ...Array.from({length: 12}, (_, i) => String(i))]] },
  { id: 'vertical', kind: 'table-vertical', x: 1200, y: 0, width: 336, height: 456, cells: [['人数', ...Array(12).fill('2\n人')]] },
] });

test('画像・文章・表・配置を保存し、取消・履歴・別名保存・競合・失敗でもデータを保つ', async () => {
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
  assert.equal(session.getSnapshot().contents.detailDocuments[0].parts.length,3);
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
  const comparison = await session.compareHistory(status.entries.at(-1).id);
  assert.ok(JSON.stringify(comparison).includes('明細'));
  assert.ok(!JSON.stringify(comparison).includes('data:image'),'画像の内容を履歴差分の文言へ出さない');
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
