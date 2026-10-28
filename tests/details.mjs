import assert from "node:assert/strict";
import { readDerivedPlan } from "./derived-plan.mjs";
export async function verifyDetails(api) {
  let bytes = await api.createTriadicDatabase();
  const initial = await api.readPlanContents(bytes);
  const sales = initial.accounts.find(a => a.accountType === "sales");
  const expense = initial.accounts.find(a => a.accountType === "expense");
  const draft = { name: "明細検証", note: "", expansionId: initial.expansions[0].id, industryId: initial.industries[0].id, departmentId: initial.departments[0].id, fiscalYear: "2026", rows: [{ accountId: sales.id, amounts: { 4: "0.001" } }, { accountId: sales.id, amounts: {} }] };
  bytes = await api.registerInitiative(bytes, draft);
  bytes = await api.registerInitiative(bytes, { ...draft, name: "別施策" });
  const contents = await readDerivedPlan(api, bytes), item = contents.initiatives[0];
  assert.equal(contents.details.length, 96);
  assert.deepEqual(contents.details.filter(row => row.kindId === 1).slice(0,12).map(row => row.month), [4,5,6,7,8,9,10,11,12,1,2,3]);
  const command = draft => ({type:"initiative.update",id:item.id,draft:{...draft,fiscalYear:"2026"}});
  const source = bytes.slice();
  bytes = await api.applyPlanCommand(bytes,command({...item,rows:item.rows.map((row,index)=>index===0?{...row,amounts:{...row.amounts,4:"-0.001"}}:row)}),2026);
  let after = await readDerivedPlan(api, bytes), current = after.initiatives[0];
  assert.equal(after.details.filter(row => row.amount !== contents.details.find(item => item.id === row.id).amount).length, 2);
  assert.equal(after.details[0].sales, "-0.001");
  assert.deepEqual(await readDerivedPlan(api, source), contents, "元のバイト列は変更しない");
  const reassigned = await api.applyPlanCommand(bytes,command({...current,rows:current.rows.map((row,index)=>index===0?{...row,accountId:expense.id}:row)}),2026);
  const reassignedPlan = await readDerivedPlan(api, reassigned);
  assert.equal(reassignedPlan.initiatives[0].rows[0].accountId, expense.id);
  assert.deepEqual(reassignedPlan.initiatives[0].rows[0].amounts, current.rows[0].amounts, "負数の金額を保持して科目変更する");
  assert.equal(reassignedPlan.details[0].sales, "0", "変更後の科目属性で再計算する");
  assert.deepEqual(reassignedPlan.initiatives[1], after.initiatives[1], "他施策は変わらない");
  bytes = await api.applyPlanCommand(bytes,command({...current,rows:current.rows.map((row,index)=>index===1?{...row,accountId:expense.id}:row)}),2026);
  after = await readDerivedPlan(api, bytes);current=after.initiatives[0];
  assert.equal(after.details.filter(row => row.accountId === expense.id).length, 24);
  assert.equal(after.details[0].accountId, sales.id, "同科目の別入力行を変更しない");
  assert.equal(after.details[24].sales, "0");assert.equal(after.details[24].profit, "0");
  bytes = await api.applyPlanCommand(bytes,command({...current,name:"変更施策"}),2026);
  after=await readDerivedPlan(api,bytes);current=after.initiatives[0];
  assert.equal(after.details.filter(row=>row.initiativeName==="変更施策").length,48);
  assert.equal(after.details.filter(row=>row.initiativeName==="別施策").length,48);
  assert.equal(after.details.find(row=>row.month===1).year,2027);
  for(const [change,reason] of [
    [{name:"別施策"},/同じ施策名/], [{fiscalYear:"9999"},/年度/], [{expansionId:null},/展開/],
    ...[["accountId",999999,/勘定科目/],["amount","0.0001",/3桁/],["amount","9007199254740.992",/有効な金額/]].map(([field,value,reason])=>[
      {rows:current.rows.map((row,index)=>index===1?field==="amount"?{...row,amounts:{...row.amounts,4:value}}:{...row,accountId:value}:row)},reason]),
  ]) await assert.rejects(api.applyPlanCommand(bytes,{...command({...current,...change}),draft:{...current,fiscalYear:"2026",...change}},2026),reason);
  const zeroed=await api.applyPlanCommand(bytes,command({...current,rows:current.rows.map((row,index)=>index===1?{...row,amounts:{...row.amounts,4:""}}:row)}),2026);
  assert.equal((await api.readPlanContents(zeroed)).initiatives[0].rows[1].amounts[4],"0");
  assert.equal(api.amountToYen("9007199254740.991"),9007199254740991);
  assert.equal(api.yenToAmount(9007199254740991),"9007199254740.991");
  const db=await api.openTriadicDatabase(bytes), rowId=current.rows[1].id;
  assert.throws(()=>db.run("INSERT INTO initiative_amounts(row_id,kind_id,month) VALUES (?,1,4)",[rowId]),/UNIQUE/);
  db.run("DELETE FROM initiative_amounts WHERE row_id=? AND kind_id=1 AND month=4",[rowId]);
  const broken=db.export();db.close();await assert.rejects(api.validateTriadicDatabase(broken),/読み込めません/);
  const roundedRows=[{amount:"1.234"},{amount:"1.499"},{amount:"1.5"},{amount:"-0.001"}];
  assert.deepEqual(roundedRows.map(row=>api.formatYen(api.amountToYen(row.amount))),["1","1","2","0"]);
  assert.deepEqual(roundedRows.map(row=>row.amount),["1.234","1.499","1.5","-0.001"]);
  let stored=bytes,writes=0;
  const handle={name:"test.triadic",async getFile(){return new File([stored],this.name)},async createWritable(){return {async write(){writes++},async close(){throw new Error("保存失敗")},async abort(){}}}};
  const session=new api.PlanSession();await session.open({bytes,name:handle.name,handle});const before=session.getSnapshot();
  const edit=command({...current,rows:current.rows.map((row,index)=>index===1?{...row,amounts:{...row.amounts,4:"100"}}:row)});
  await assert.rejects(session.dispatch(edit,async()=>handle),/保存失敗/);
  assert.equal(writes,1);assert.deepEqual(stored,bytes);assert.deepEqual(session.getSnapshot(),before);
  // Actual overlapping edits are rejected through the same session/file boundary as the product.
  stored=await api.applyPlanCommand(bytes,command({...current,rows:current.rows.map((row,index)=>index===1?{...row,amounts:{...row.amounts,4:"200"}}:row)}),2026);
  const external=stored.slice(),stop=api.registerFileConflictRecovery(async()=>null);
  try {await assert.rejects(session.dispatch(edit,async()=>handle),/入力は.*保持/)}finally{stop()}
  assert.equal(writes,1);assert.deepEqual(stored,external);assert.deepEqual(session.getSnapshot(),before);
  console.log("PASS: 現行施策命令の所有範囲・12か月・年度・精度・入力拒否とPlanSessionの失敗・競合保護");
}
