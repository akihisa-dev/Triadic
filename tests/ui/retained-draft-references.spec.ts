import { test, expect, openInitiativeEntry, selectClassification } from './fixtures';

for (const source of ['selection', 'master', 'retry']) test(`未登録施策を保持した${source}保存で部署が再作成されても入力先を付け替えない`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=defaults');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate((_body, failFirst: boolean) => {
    const target = window as Window & typeof globalThis & { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    const picker = target.showOpenFilePicker.bind(target);
    Object.defineProperty(target, 'showOpenFilePicker', { value: async () => {
      const [handle] = await picker();
      const get = handle!.getFile.bind(handle), create = handle!.createWritable.bind(handle);
      const path = '/Triadichrome-extension/src/core/storage/';
      const { changeDepartmentMaster } = await import(path + 'departmentMaster.ts');
      let external = new Uint8Array(await (await get()).arrayBuffer());
      external = await changeDepartmentMaster(external, { type: 'delete', id: 2 });
      external = await changeDepartmentMaster(external, { type: 'add', departmentName: '部署C', industryIds: [1] });
      let reads = 0, committed = false, failed = false;
      Object.defineProperty(handle, 'getFile', { value: async () => ++reads > 1 && !committed ? new File([external], handle!.name) : get() });
      Object.defineProperty(handle, 'createWritable', { value: async () => {
        if (failFirst && !failed) { failed = true; throw new Error('参照保護の保存失敗'); }
        const writer = await create(), close = writer.close.bind(writer);
        Object.defineProperty(writer, 'close', { value: async () => { await close(); committed = true; } });
        return writer;
      } });
      return [handle!];
    } });
  }, source === 'retry');
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await openInitiativeEntry(app);
  await app.getByRole('textbox', { name: '施策名', exact: true }).fill('保持する施策');
  await app.getByRole('textbox', { name: '備考', exact: true }).fill('部署Bへの入力');
  await selectClassification(app.getByRole('combobox', { name: '展開名', exact: true }), '料改');
  await selectClassification(app.getByRole('combobox', { name: '部署名', exact: true }), '部署B');
  await selectClassification(app.getByRole('combobox', { name: '業種名', exact: true }), '直営自動車');
  const account = app.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await account.focus(); await account.selectOption('1');
  const amount = app.getByRole('spinbutton', { name: '売上高 4月の金額', exact: true }).first();
  await amount.fill('123.456');
  const menu = app.getByRole('navigation', { name: 'メインナビゲーション' });
  const back = app.getByRole('button', { name: '前の画面に戻る', exact: true });
  if (source === 'master') {
    await menu.getByRole('button', { name: 'マスタ', exact: true }).click();
    await app.getByRole('button', { name: /^期間マスタ/ }).click();
    await app.getByRole('textbox', { name: '期間名', exact: true }).fill('無関係な期間');
    await app.getByRole('button', { name: '登録', exact: true }).click();
    await expect(app.getByText('無関係な期間', { exact: true })).toBeVisible();
    await back.click(); await back.click();
  } else {
    await menu.getByRole('button', { name: '総原価表', exact: true }).click();
    const slot = app.getByRole('spinbutton', { name: '比較対象1', exact: true });
    if (source === 'retry') await slot.getByRole('button', { name: '確定予算', exact: true }).click();
    else await selectClassification(slot, '確定予算');
    if (source === 'retry') {
      await expect(app.getByRole('alert')).toContainText('参照保護の保存失敗');
      await back.click();
      await expect(app.getByRole('combobox', { name: '部署名', exact: true })).toHaveValue('2');
      await expect(amount).toHaveValue('123.456');
      await menu.getByRole('button', { name: '総原価表', exact: true }).click();
      await selectClassification(slot, '確定予算');
    }
    await expect(app.getByRole('alert')).toContainText('未選択の項目を選び直してください');
    await back.click();
  }
  await expect(app.getByRole('textbox', { name: '施策名', exact: true })).toHaveValue('保持する施策');
  await expect(app.getByRole('textbox', { name: '備考', exact: true })).toHaveValue('部署Bへの入力');
  await expect(app.getByRole('combobox', { name: '部署名', exact: true })).toHaveValue('');
  await expect(app.getByRole('combobox', { name: '業種名', exact: true })).toHaveValue('');
  await expect(amount).toHaveValue('123.456');
  await expect(app.getByRole('button', { name: '登録', exact: true })).toBeDisabled();
  await selectClassification(app.getByRole('combobox', { name: '部署名', exact: true }), '部署C');
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(app.getByRole('button', { name: '保持する施策', exact: true })).toBeVisible();
});


for (const replacement of ['account', 'industry']) test(`外部${replacement}変更で未選択となった参照を金額を保持して再選択できる`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=defaults');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate((_body, replacement: string) => {
    const target = window as Window & typeof globalThis & { showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
    const picker = target.showOpenFilePicker.bind(target);
    Object.defineProperty(target, 'showOpenFilePicker', { value: async () => {
      const [handle] = await picker();
      const get = handle!.getFile.bind(handle), create = handle!.createWritable.bind(handle);
      const path = '/Triadichrome-extension/src/core/storage/';
      let external = new Uint8Array(await (await get()).arrayBuffer());
      const { readPlanContents } = await import(path + 'readPlan.ts');
      const contents = await readPlanContents(external);
      if (replacement === 'account') {
        const { changeAccountMaster } = await import(path + 'accountMaster.ts');
        const account = contents.accounts.find((item: {id:number}) => item.id === 1);
        external = (await changeAccountMaster(external, { type: 'update', id: 1, accountCode: account.accountCode, accountName: '改名した売上高', accountType: account.accountType })).bytes;
      } else {
        const { changeDepartmentMaster } = await import(path + 'departmentMaster.ts');
        const { changeIndustryMaster } = await import(path + 'industryMaster.ts');
        for (const department of contents.departments) external = await changeDepartmentMaster(external, { type: 'update', id: department.id,
          departmentName: department.departmentName, industryIds: department.industryIds.filter((id: number) => id !== 9) });
        external = await changeIndustryMaster(external, { type: 'delete', id: 9 });
        external = await changeIndustryMaster(external, { type: 'add', industryCode: '9', industryName: '再作成した業種' });
        external = await changeDepartmentMaster(external, { type: 'update', id: 2, departmentName: '部署B', industryIds: [9] });
      }
      let reads = 0, committed = false;
      Object.defineProperty(handle, 'getFile', { value: async () => ++reads > 1 && !committed ? new File([external], handle!.name) : get() });
      Object.defineProperty(handle, 'createWritable', { value: async () => {
        const writer = await create(), close = writer.close.bind(writer);
        Object.defineProperty(writer, 'close', { value: async () => { await close(); committed = true; } }); return writer;
      } });
      return [handle!];
    } });
  }, replacement);
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('button', { name: 'サイドバーを開く', exact: true }).click();
  await openInitiativeEntry(app);
  await app.getByRole('textbox', { name: '施策名', exact: true }).fill('再選択する施策');
  await selectClassification(app.getByRole('combobox', { name: '展開名', exact: true }), '料改');
  await selectClassification(app.getByRole('combobox', { name: '部署名', exact: true }), '部署B');
  await selectClassification(app.getByRole('combobox', { name: '業種名', exact: true }), '不動産B');
  const account = app.getByRole('combobox', { name: '1行目の勘定科目', exact: true });
  await account.focus(); await account.selectOption('1');
  await app.getByRole('spinbutton', { name: '売上高 4月の金額', exact: true }).fill('123.456');
  const menu = app.getByRole('navigation', { name: 'メインナビゲーション' });
  await menu.getByRole('button', { name: '総原価表', exact: true }).click();
  await selectClassification(app.getByRole('spinbutton', { name: '比較対象1', exact: true }), '確定予算');
  await expect(app.getByRole('alert')).toContainText('未選択の項目を選び直してください');
  await app.getByRole('button', { name: '前の画面に戻る', exact: true }).click();
  if (replacement === 'account') {
    await expect(account).toHaveValue(''); await expect(account).toBeEnabled();
    await account.focus(); await account.selectOption('1');
    await expect(app.getByRole('spinbutton', { name: '改名した売上高 4月の金額', exact: true })).toHaveValue('123.456');
  } else {
    const industry = app.getByRole('combobox', { name: '業種名', exact: true });
    await expect(industry).toHaveValue(''); await expect(industry).toBeEnabled();
    await selectClassification(industry, '再作成した業種');
    await expect(app.getByRole('spinbutton', { name: '売上高 4月の金額', exact: true })).toHaveValue('123.456');
  }
  await app.getByRole('button', { name: '登録', exact: true }).click();
  await expect(app.getByRole('button', { name: '再選択する施策', exact: true })).toBeVisible();
});
