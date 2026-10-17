import assert from 'node:assert/strict';

export async function verifyExpansionTableView(api) {
  const contents = await api.readPlanContents(await api.createSamplePlan(2026));
  const ordered={...contents,previousAmounts:[],expansions:contents.expansions.slice(0,1),
    periodTypes:[5,-1,0].map(id=>({id,periodName:`期間${id}`,startMonthRule:'new'})),
    expansionCategories:[5,-1,0].map(id=>({id,categoryName:`区分${id}`})),
    initiatives:[['A',0,0],['B',-1,-1],['C',5,0],['D',null,null],['E',-1,-1],['F',-1,5]].map(([name,periodTypeId,expansionCategoryId],i)=>({...contents.initiatives[0],id:i+1,name,expansionId:contents.expansions[0].id,periodTypeId,expansionCategoryId,rows:[]}))};
  for(const selected of [[1],[2],[1,2],[2,1]]) {
    const view=api.createExpansionTableView(ordered)(selected);
    assert.deepEqual(view.flat.filter(row=>!row.subtotal).map(row=>row.item.name),['C','F','B','E','A','D'],'期間・区分のマスタ順と区分内の登録順、未選択の末尾');
    const wb=api.createReportWorkbook(ordered,{tables:['expansion-table'],selections:{'cost-table':[1],'initiative-list':[2],'expansion-table':selected},costFilter:{industries:null,departments:null}});
    const sheet=wb.getWorksheet('展開表');
    assert.deepEqual([9,10,11,12,13,14].map(r=>sheet.getCell(r,4).value),['C','F','B','E','A','D']);
    assert.ok(sheet.model.merges.includes('B10:B12'));assert.ok(sheet.model.merges.includes('C11:C12'));
    const renamed={...ordered,periodTypes:[...ordered.periodTypes].reverse().map(p=>({...p,periodName:p.periodName+'改名'})),expansionCategories:[...ordered.expansionCategories].reverse()};
    const fresh=api.createExpansionTableView(renamed)(selected);
    assert.deepEqual(fresh.flat.filter(row=>!row.subtotal).map(row=>row.item.name),['A','B','E','F','C','D']);
    assert.equal(fresh.groups[0].periods[0].name,'期間0改名');
  }
  for (const count of [100, 500, 1000]) {
    let periodReads=0,categoryReads=0;
    const periods=Array.from({length:count},(_,id)=>({get id(){periodReads++;return id},periodName:`期間${id}`,startMonthRule:'new'}));
    const categories=Array.from({length:count},(_,id)=>({get id(){categoryReads++;return id},categoryName:`区分${id}`}));
    const expansions=Array.from({length:count},(_,id)=>({id,expansionCode:String(id+1),expansionName:`展開${id}`}));
    const empty={...contents,initiatives:[],previousAmounts:[],expansions,periodTypes:periods,expansionCategories:categories};
    const cached=api.createExpansionTableView(empty);
    for(const selected of [[1],[2],[1,2],[2,1]]) assert.equal(cached(selected).flat.length,count);
    assert.ok(periodReads<=count*2,`空展開で期間を反復走査しない: ${periodReads}`);
    assert.ok(categoryReads<=count*2);
    const populated={...empty,initiatives:Array.from({length:count},(_,id)=>({...contents.initiatives[0],id,expansionId:id,periodTypeId:count-1-id,expansionCategoryId:id%2,rows:[]}))};
    periodReads=0;categoryReads=0;
    const view=api.createExpansionTableView(populated);
    for(const selected of [[1],[2],[1,2],[2,1]]) assert.equal(view(selected).flat.length,count*2);
    assert.ok(periodReads<=count*2);assert.ok(categoryReads<=count*2,'非空の各期間でも区分索引を共有');
    if(count!==100) continue; // The workbook path uses 100 groups; avoid adding a million-cell test artifact.
    periodReads=0;categoryReads=0;
    const wb=api.createReportWorkbook(populated,{tables:['expansion-table'],selections:{'cost-table':[1],'initiative-list':[2],'expansion-table':[1,2]},costFilter:{industries:null,departments:null}});
    assert.ok(periodReads<=count*4,`Excelの期間索引を共有: ${periodReads}`);assert.ok(categoryReads<=count*4,`Excelの区分索引を共有: ${categoryReads}`);
    console.log(`grouping workbook: ${count} masters/groups, period IDs=${periodReads}, category IDs=${categoryReads}`);
    const expected=view([1,2]).flat.filter(row=>!row.subtotal).map(row=>[row.period.name,row.item.name]);
    const sheet=wb.getWorksheet('展開表'),actual=[];
    for(let r=9;r<=sheet.rowCount;r++)if(sheet.getCell(r,4).value===contents.initiatives[0].name)actual.push([sheet.getCell(r,2).value,sheet.getCell(r,4).value]);
    assert.deepEqual(actual,expected,'画面とExcelの期間名・登録順を維持');
  }
  const before = structuredClone(contents);
  const viewForSelection = api.createExpansionTableView(contents);
  for (const selected of [[1], [2], [1, 2], [2, 1]]) {
    const view = viewForSelection(selected);
    assert.deepEqual(view.table, api.buildKindExpansionTable(contents, selected, 'registered'), '前年・合計・小計・施策の円単位金額と比較方向を維持');
    assert.equal(viewForSelection([...selected]), view, '選択配列が作り直されても同じ組み合わせの結果を再利用');
    assert.equal(view.flat.length, view.table.groups.reduce((sum, group) => sum + group.initiatives.length + 1, 0));
    for (const { group, periods } of view.groups) {
      assert.deepEqual(periods.map(period => period.id), api.groupExpansionPeriods(group.initiatives, contents.periodTypes).map(period => period.id), '期間順を維持');
      for (const period of periods) {
        assert.equal(new Set(period.categories.map(category => category.id)).size, period.categories.length);
        for (const category of period.categories) assert.deepEqual(category.initiatives.map(item => item.id), group.initiatives.filter(item => item.periodTypeId === period.id && (item.expansionCategoryId ?? null) === category.id).map(item => item.id), '区分内登録順を維持');
      }
      assert.deepEqual(view.flat.filter(row => row.group === group && !row.subtotal).map(row => row.item.id), periods.flatMap(period => period.initiatives.map(item => item.id)));
    }
    for (const period of api.tablePeriods) for (const metric of ['sales', 'profit']) {
      assert.deepEqual(view.table.total.map(months => api.expansionPeriodAmount(months, period, metric)), api.buildKindExpansionTable(contents, selected, 'registered').total.map(months => api.expansionPeriodAmount(months, period, metric)), '月・四半期・半期・年間の丸め前金額を維持');
    }
  }
  assert.notEqual(viewForSelection([1, 2]), viewForSelection([2, 1]), '列順を異なる選択として保持');
  const variants = [
    { ...contents, initiatives: contents.initiatives.map((item, i) => i ? item : { ...item, rows: item.rows.map(row => ({ ...row, amounts: { ...row.amounts, 4: '1.001' } })) }) },
    { ...contents, accounts: contents.accounts.map(account => ({ ...account, accountType: null })) },
    { ...contents, previousAmounts: [] },
    { ...contents, expansions: contents.expansions.map(item => ({ ...item, expansionName: item.expansionName + '更新' })) },
    { ...contents, periodTypes: [...contents.periodTypes].reverse() },
    { ...contents, fiscalYear: 2025 },
    { ...contents, expansionCategories: [...contents.expansionCategories].reverse() },
  ];
  for (const changed of variants) {
    const fresh = api.createExpansionTableView(changed)([1, 2]);
    assert.notEqual(fresh, viewForSelection([1, 2]), '計算元変更後のキャッシュは独立');
    assert.deepEqual(fresh.table, api.buildKindExpansionTable(changed, [1, 2], 'registered'));
  }
  const salesId = contents.accounts.find(account => account.accountType === 'sales').id;
  const huge = { ...contents, initiatives: contents.initiatives.slice(0, 1).map(item => ({ ...item, rows: [1, 2].map(() => ({ accountId: salesId, amounts: { 4: '5000000000000' } })) })) };
  const overflowing = api.createExpansionTableView(huge);
  assert.throws(() => overflowing([1]), /範囲/);
  assert.throws(() => overflowing([1]), /範囲/, '失敗した計算を有効な結果として登録しない');
  assert.deepEqual(contents, before, '計算・再利用・失敗で入力データを変更しない');
  for (const large of [false, true]) {
    const signed = await api.readPlanContents(await api.createSignedCategoryPlan(large, 2026));
    for (const selected of [[1], [2], [1, 2], [2, 1]]) {
      const html = api.renderExpansionTable(signed, selected);
      for (const name of (large ? ['負ID区分'] : ['負ID区分', 'ゼロID区分', '正ID区分', ''])) assert.ok(html.includes(`class="expansion-category" title="${name}">${name}</td>`), `通常・仮想表示の本文とtitle: ${name}`);
    }
    const view = api.createExpansionTableView(signed)([1]);
    for (const row of view.flat.filter(row => !row.subtotal)) {
      assert.ok(row.categoryOffset < row.categoryCount);
      assert.equal(view.flat[view.flat.indexOf(row) - row.categoryOffset].categoryOffset, 0);
    }
    if (large) assert.ok(api.renderExpansionTable(signed, [1]).includes('rowSpan="40" class="expansion-category"'), '仮想表示末尾で区分の結合長を切る');
    if (!large) {
      const doubled = { ...signed, initiatives: [...signed.initiatives, ...signed.initiatives.map(item => ({ ...item, id: item.id + 10000 }))] };
      const doubledHtml = api.renderExpansionTable(doubled, [1]);
      assert.equal((doubledHtml.match(/rowSpan="2" class="expansion-category"/g) ?? []).length, 4, '通常表示では各区分と未選択を2行結合');
    }
    const renamed = { ...signed, expansionCategories: signed.expansionCategories.map(item => ({ ...item, categoryName: item.categoryName + '改名' })) };
    const html = api.renderExpansionTable(renamed);
    assert.ok(html.includes('title="負ID区分改名">負ID区分改名</td>'));
    if (!large) assert.ok(html.includes('class="expansion-category" title=""></td>'));
  }
  console.log('PASS: 展開表の選択再利用、逆順比較、期間計と行順、計算元変更、上限超過と入力保持');
}
