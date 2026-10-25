import { test, expect, openInitiativeEntry, selectAccount, selectClassification, settleMotion } from './fixtures';
for (const surface of ['entry', 'detail', 'previous']) for (const kind of [1, 2]) {
  test(`${surface}種別${kind}: 式を確定して数値だけ保存し、失敗と取消で値を守る`, async ({ page, app }) => {
    if (surface === 'previous') await page.setViewportSize({ width: Math.max(600, page.viewportSize()!.width), height: 1400 });
    await page.goto('/tests/ui/preview.html');
    await expect(page.getByRole('status')).toHaveText('操作できます');
    await app.locator('body').evaluate(() => {
      const target = window as unknown as Window & { formulaWrites: number; showOpenFilePicker: () => Promise<FileSystemFileHandle[]> };
      target.formulaWrites = 0;
      const pick = target.showOpenFilePicker;
      target.showOpenFilePicker = async () => {
        const handles = await pick(), handle = handles[0]!, create = handle.createWritable.bind(handle);
        handle.createWritable = async (...args) => { target.formulaWrites++; return create(...args); };
        return handles;
      };
    });
    await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
    const nav = app.getByRole('navigation', { name: 'メインナビゲーション' });
    if (surface === 'previous') {
      await nav.getByRole('button', { name: '前年入力', exact: true }).click();
      await selectClassification(app.getByRole('combobox', { name: '部署名', exact: true }), '部署A');
      await selectClassification(app.getByRole('combobox', { name: '業種名', exact: true }), '直営自動車');
      await selectClassification(app.getByRole('spinbutton', { name: '前年', exact: true }), kind === 1 ? '前年見込' : '前年実績');
    } else if (surface === 'entry') {
      await openInitiativeEntry(app);
      await app.getByRole('textbox', { name: '施策名', exact: true }).fill('計算式の登録確認');
      for (const [name, choice] of [['展開名', 'コスト'], ['部署名', '部署A'], ['業種名', '直営自動車']] as const) {
        await selectClassification(app.getByRole('combobox', { name, exact: true }), choice!);
      }
      await selectAccount(app.getByRole('combobox', { name: '1行目の勘定科目', exact: true }), '1');
    } else {
      await nav.getByRole('button', { name: '施策一覧', exact: true }).click();
      await app.getByRole('button', { name: '既存商品の販売拡大', exact: true }).click();
    }
    if (surface !== 'previous') await app.getByRole('tab', { name: kind === 1 ? '一次予算' : '確定予算', exact: true }).click();
    await settleMotion(app.locator('body'));
    const table = app.getByRole('table', { name: surface === 'previous' ? '前年入力の月別金額' : '月別計画金額', exact: true });
    const first = table.locator('input[data-row="0"][data-column="0"]');
    const next = table.locator('input[data-row="0"][data-column="1"]');
    await first.fill('=12*4');
    await page.waitForTimeout(800); // The autosave deadline must not persist an uncommitted expression.
    expect(await app.locator('body').evaluate(() => (window as unknown as { formulaWrites: number }).formulaWrites)).toBe(0);
    await first.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await expect(first).toHaveValue('=12*4');
    await first.press('Tab');
    await expect(first).toHaveValue('48'); await expect(next).toBeFocused();
    await next.fill('=(0.1+0.2)*10');
    await table.getByRole('columnheader', { name: '5月', exact: true }).click();
    await expect(next).toHaveValue('3');
    await first.fill('=1/0'); await first.press('Enter');
    await expect(first).toBeFocused(); await expect(first).toHaveValue('=1/0');
    await expect(app.getByText('0で割ることはできません。', { exact: true })).toBeVisible();
    await table.getByRole('columnheader', { name: '4月', exact: true }).click();
    await first.focus(); await first.press('Escape'); await expect(first).toHaveValue('48');
    await first.fill('=1/3'); await first.press('Tab');
    await expect(first).toBeFocused(); await expect(first).toHaveValue('=1/3');
    await first.press('Escape'); await expect(first).toHaveValue('48');
    await first.fill('=1-1'); await first.press('Enter'); await expect(first).toHaveValue('0');
    if (surface === 'entry') {
      await app.getByRole('button', { name: '登録', exact: true }).click();
      await app.getByRole('button', { name: '計算式の登録確認', exact: true }).click();
      await app.getByRole('tab', { name: kind === 1 ? '一次予算' : '確定予算', exact: true }).click();
    } else {
      await expect(nav.getByRole('button', { name: '総原価表', exact: true })).toBeEnabled();
      await nav.getByRole('button', { name: '総原価表', exact: true }).click();
      if (surface === 'detail') {
        await nav.getByRole('button', { name: '施策一覧', exact: true }).click();
        await app.getByRole('button', { name: '既存商品の販売拡大', exact: true }).click();
        await app.getByRole('tab', { name: kind === 1 ? '一次予算' : '確定予算', exact: true }).click();
      } else {
        await nav.getByRole('button', { name: '前年入力', exact: true }).click();
        await selectClassification(app.getByRole('combobox', { name: '部署名', exact: true }), '部署A');
        await selectClassification(app.getByRole('combobox', { name: '業種名', exact: true }), '直営自動車');
        await selectClassification(app.getByRole('spinbutton', { name: '前年', exact: true }), kind === 1 ? '前年見込' : '前年実績');
      }
    }
    await expect(first).toHaveValue('0'); await expect(next).toHaveValue('3');
    await first.press('F2'); await expect(first).toHaveValue('0');
  });
}
