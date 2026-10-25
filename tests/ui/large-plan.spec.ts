import {test, expect} from './fixtures';

test('基準サンプルの全件・末尾・総原価表・展開表・施策一覧・編集と取消を確認する', async ({page,app}) => {
  test.setTimeout(120_000);
  await page.getByLabel('テストデータ').selectOption('large');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  const nav=app.getByRole('navigation',{name:'メインナビゲーション'});
  await expect(nav).toBeAttached();
  await expect(page.getByLabel('テストデータ').locator('option:checked')).toHaveText('2027年度サンプル予算');
  await expect(app.getByRole('status',{name:'基準年度',exact:true})).toHaveText('2027年度');
  const navigate=async(name:string)=>{
    await app.getByRole('button',{name:'サイドバーを開く',exact:true}).click();
    await nav.getByRole('button',{name,exact:true}).click();
    await app.getByRole('button',{name:'サイドバーを閉じる',exact:true}).last().click();
    await expect(app.getByRole('heading',{name,exact:true})).toBeVisible();
  };
  await navigate('施策一覧');
  const list=app.locator('.initiative-list-table');
  await expect(list).toHaveAttribute('aria-rowcount','32');
  expect(await list.locator('tbody tr:not(.virtual-row-spacer):not([aria-hidden="true"])').count()).toBeLessThanOrEqual(29);
  const total=await list.locator('tfoot').textContent();
  await app.locator('.initiative-list-container').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect(list.getByRole('button',{name:'本社・倉庫設備資金の借入と利息',exact:true})).toBeAttached();
  expect(await list.locator('tbody tr:not(.virtual-row-spacer):not([aria-hidden="true"])').count()).toBeLessThanOrEqual(29);
  expect(await list.locator('tfoot').textContent()).toBe(total);
  await navigate('展開表');
  const expansion=app.locator('.expansion-table-page .initiative-list-table');
  expect(await expansion.locator('tbody tr:not(.virtual-row-spacer)').count()).toBe(37);
  await app.locator('.expansion-table-page .initiative-list-container').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await expect(expansion.locator('.expansion-subtotal-name').last()).toContainText('計');
  await expect(nav.getByRole('button',{name:'明細',exact:true})).toHaveCount(0);
  await navigate('総原価表');
  await expect(app.getByRole('heading',{name:'総原価表',exact:true})).toBeVisible();
  await navigate('施策一覧');
  await app.locator('.initiative-list-container').evaluate(el=>{el.scrollTop=0;});
  await list.getByRole('button',{name:'東京・既存アパレル荷主の運賃是正',exact:true}).click();
  await app.getByRole('tab',{name:'一次予算',exact:true}).click();
  const amount=app.getByRole('spinbutton',{name:'売上高 4月の金額',exact:true}).first();
  await expect(amount).toHaveValue('3000');
  await amount.fill('3100');
  await amount.press('Tab');
  await expect(app.getByRole('button',{name:'操作を取り消す',exact:true})).toBeEnabled({timeout:60_000});
  await app.getByRole('button',{name:'操作を取り消す',exact:true}).click();
  await expect(amount).toHaveValue('3000',{timeout:60_000});
  await expect(app.getByRole('button',{name:'操作をやり直す',exact:true})).toBeEnabled();
  await app.getByRole('button',{name:'操作をやり直す',exact:true}).click();
  await expect(amount).toHaveValue('3100',{timeout:60_000});
  await app.getByRole('button',{name:'操作を取り消す',exact:true}).click();
  await expect(amount).toHaveValue('3000',{timeout:60_000});
});

test('基準サンプルの費用UP5区分は目的・科目・確定改定に一致する', async ({page,app}) => {
  test.setTimeout(120_000);
  await page.getByLabel('テストデータ').selectOption('large');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('button',{name:'サイドバーを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'施策一覧',exact:true}).click();
  await app.getByRole('button',{name:'サイドバーを閉じる',exact:true}).last().click();
  const cases = [
    {name:'大阪・倉庫派遣契約の時間単価上昇',category:'下払いUP',account:'臨時傭員費',month:7,primary:'2000',confirmed:'2000',reason:'時給100円'},
    {name:'東京・運転職の定着に向けた基本給改定',category:'ベースアップ',account:'給料手当',month:7,primary:'928',confirmed:'928',reason:'116名'},
    {name:'大阪・仕分け設備の段階導入',category:'設備投資',account:'固定資産減価償却費',month:9,primary:'600',confirmed:'0',reason:'11月に検収延期'},
    {name:'東京・軽油の契約単価上昇',category:'燃料費UP',account:'燃料油脂費',month:10,primary:'720',confirmed:'540',reason:'共同購入'},
    {name:'東京・既存倉庫の電力契約更新',category:'電気料金UP',account:'動力光熱費',month:12,primary:'700',confirmed:'700',reason:'暖房需要'},
  ];
  for(const item of cases) {
    await app.getByRole('button',{name:item.name,exact:true}).click();
    await expect(app.getByRole('combobox',{name:'展開区分',exact:true}).locator('option:checked')).toHaveText(item.category);
    await expect(app.getByRole('textbox',{name:'備考',exact:true})).toHaveValue(new RegExp(item.reason));
    await app.getByRole('tab',{name:'一次予算',exact:true}).click();
    const amount=app.getByRole('spinbutton',{name:`${item.account} ${item.month}月の金額`,exact:true});
    await expect(amount).toHaveValue(item.primary);
    await app.getByRole('tab',{name:'確定予算',exact:true}).click();
    await expect(amount).toHaveValue(item.confirmed);
    await app.getByRole('button',{name:'← 施策一覧へ戻る',exact:true}).click();
  }
});


test('明細の導線を持たず施策の全月を直接編集して保存・取消できる', async ({ page, app }) => {
  await page.getByLabel('テストデータ').selectOption('large');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  const nav = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await expect(nav.getByRole('button', { name: '明細', exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: '施策一覧', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを閉じる', exact: true }).last().click();
  await app.getByRole('button', { name: '関東第一倉庫・生活雑貨の保管出荷受託', exact: true }).click();
  await app.getByRole('tab', { name: '一次予算', exact: true }).click();
  await expect(app.getByRole('button', { name: '明細', exact: true })).toHaveCount(0);
  const row = app.getByRole('table', { name: '月別計画金額', exact: true }).locator('tbody tr').first();
  await expect(row.getByRole('spinbutton')).toHaveCount(12);
  for (const cell of await row.getByRole('spinbutton').all()) await expect(cell).toBeEditable();
  const march = app.getByRole('spinbutton', { name: '売上高 3月の金額', exact: true });
  await expect(march).toHaveValue('40000');
  await march.fill('41000');
  await march.press('Tab');
  await expect(app.getByRole('button', { name: '操作を取り消す', exact: true })).toBeEnabled();
  await app.getByRole('button', { name: '← 施策一覧へ戻る', exact: true }).click();
  await app.getByRole('button', { name: '関東第一倉庫・生活雑貨の保管出荷受託', exact: true }).click();
  await expect(march).toHaveValue('41000');
  await app.getByRole('button', { name: '操作を取り消す', exact: true }).click();
  await expect(march).toHaveValue('40000');
});
