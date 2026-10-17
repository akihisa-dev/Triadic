import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { evaluator } from './report-workbook.mjs';
export async function verifyExpansionExpenseOverflow(api){
  const bytes=await api.createExpenseOverflowPlan(),before=bytes.slice();
  const plan=await api.readPlanContents(bytes);
  assert.equal(plan.initiatives[0].rows.length,4);
  assert.equal(plan.initiatives[0].rows[0].amounts[4],'5000000000000');
  const options=selected=>({tables:['expansion-table'],selections:{'cost-table':[1],'initiative-list':[2],'expansion-table':selected},costFilter:{industries:null,departments:null}});
  for(const selected of [[1],[2],[1,2],[2,1]]){
    const table=api.buildKindExpansionTable(plan,selected,'registered');
    for(const values of [table.previous,table.total,table.changes,...table.groups.flatMap(group=>[group.values,...group.initiatives.map(item=>item.values)])])
      for(const months of values) for(const period of api.tablePeriods) for(const metric of ['sales','profit']) assert.equal(api.expansionPeriodAmount(months,period,metric),0);
    for(const kind of selected) assert.throws(()=>api.initiativesForKind(plan.initiatives,plan.accounts,kind),/範囲/,'費用を表示する一覧の上限検査は維持');
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(await api.serializeWorkbook(api.createReportWorkbook(plan,options(selected))));
    const ws=wb.getWorksheet('展開表'),evaluate=evaluator(wb);
    ws.eachRow(row=>row.eachCell(cell=>{if(cell.formula&&cell.result!==undefined){assert.equal(cell.result,0);assert.equal(evaluate(ws,cell.address),0);}}));
    const control={...plan,initiatives:plan.initiatives.map(item=>({...item,rows:[item.rows[0],item.rows[2]]}))};
    assert.deepEqual(api.buildKindExpansionTable(control,selected,'registered').total,table.total,'費用が上限内の対照と同じ売上・利益');
    for(const type of ['sales','profit']){
      const id=plan.accounts.find(a=>a.accountType===type).id;
      const overflowing={...plan,initiatives:plan.initiatives.map(item=>({...item,rows:[{accountId:id,amounts:{4:'5000000000000'}},{accountId:id,amounts:{4:'5000000000000'}}]}))};
      assert.throws(()=>api.buildKindExpansionTable(overflowing,selected,'registered'),/範囲/);
      assert.throws(()=>api.createReportWorkbook(overflowing,options(selected)),/範囲/);
    }
  }
  assert.deepEqual(bytes,before);await api.validateTriadicDatabase(bytes);
  console.log('PASS: 費用のみ上限超過の実DBを登録・読込、全種別の売上利益と期間計0、展開Excelの往復・数式、一覧と表示値自体の超過拒否を維持');
}
