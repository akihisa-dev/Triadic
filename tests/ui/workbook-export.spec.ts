import ExcelJS from 'exceljs';
import { test, expect } from './fixtures';

test('出力中も応答し、中止・上限拒否・再出力を保持してデータを変更しない', async ({ page, app }) => {
  test.setTimeout(90_000);
  await page.goto('/tests/ui/preview.html?data=previous-export-limit');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate(() => {
    // Capture the generated blob in memory; never start a browser download.
    const exports: { name: string; bytes: Promise<number[]> }[] = [];
    Reflect.set(window, 'capturedExports', exports); Reflect.set(window, 'holdExportReply', true);
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) { click.call(this); return; }
      exports.push({ name: this.download, bytes: fetch(this.href).then(response => response.arrayBuffer()).then(buffer => [...new Uint8Array(buffer)]) });
    };
    const Original = Worker;
    window.Worker = new Proxy(Original, { construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker;
      if (String(args[0]).includes('workbookExport.worker')) Object.defineProperty(worker, 'onmessage', { configurable: true, set(listener: (event: MessageEvent) => void) {
        worker.addEventListener('message', event => { if (!Reflect.get(window, 'holdExportReply')) listener(event); });
      } });
      return worker;
    } });
    Reflect.set(window, 'exportHeartbeat', 0);
    setInterval(() => Reflect.set(window, 'exportHeartbeat', Reflect.get(window, 'exportHeartbeat') + 1), 10);
  });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  const hash = () => app.locator('body').evaluate(async () => {
    const [handle] = await Reflect.get(window, 'showOpenFilePicker')();
    const bytes = await (await handle.getFile()).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].join(',');
  });
  const original = await hash();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '入出力', exact: true }).click();
  const report = app.getByRole('region', { name: '表の出力', exact: true });
  await report.getByRole('button', { name: '選んだ表を出力', exact: true }).click();
  await expect(app.getByText('処理中…', { exact: true })).toBeVisible();
  const before = await app.locator('body').evaluate(() => Reflect.get(window, 'exportHeartbeat'));
  await expect.poll(() => app.locator('body').evaluate(() => Reflect.get(window, 'exportHeartbeat'))).toBeGreaterThan(before + 3);
  await report.getByRole('button', { name: '中止', exact: true }).click();
  await expect(app.getByText('出力を中止しました。', { exact: true })).toBeVisible();
  expect(await app.locator('body').evaluate(() => Reflect.get(window, 'capturedExports').length)).toBe(0);
  await app.getByRole('button', { name: '通知を閉じる', exact: true }).click();
  await app.locator('body').evaluate(() => Reflect.set(window, 'holdExportReply', false));
  await report.getByRole('button', { name: '選んだ表を出力', exact: true }).click();
  await expect(app.getByText('表を出力しました。', { exact: true })).toBeVisible({ timeout: 30_000 });
  const readExport = (index: number) => app.locator('body').evaluate(async (_node, index) => {
    const item = Reflect.get(window, 'capturedExports')[index]; return { name: item.name, bytes: await item.bytes };
  }, index);
  const emitted = await readExport(0), reportBook = new ExcelJS.Workbook();
  await reportBook.xlsx.load(Buffer.from(emitted.bytes) as unknown as ExcelJS.Buffer);
  expect(reportBook.worksheets.map(sheet => sheet.name)).toEqual(['総原価表', '施策一覧', '展開表', '計算元']);
  const dismiss = app.getByRole('button', { name: '通知を閉じる', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  const previous = app.getByRole('region', { name: '前年入力', exact: true });
  const choices = previous.getByRole('group', { name: 'フォーマットに含める業種・部署', exact: true }).getByRole('checkbox');
  for (const choice of await choices.all()) await choice.check();
  await previous.getByRole('button', { name: 'フォーマットを出力', exact: true }).click();
  await expect(app.getByRole('alert')).toContainText('取り込み上限を超える');
  expect(await app.locator('body').evaluate(() => Reflect.get(window, 'capturedExports').length)).toBe(1);
  await dismiss.click(); await choices.last().uncheck();
  await previous.getByRole('button', { name: 'フォーマットを出力', exact: true }).click();
  await expect(app.getByText('前年入力フォーマットを出力しました。', { exact: true })).toBeVisible({ timeout: 30_000 });
  const baseline = await readExport(1), previousBook = new ExcelJS.Workbook();
  await previousBook.xlsx.load(Buffer.from(baseline.bytes) as unknown as ExcelJS.Buffer);
  expect(previousBook.worksheets.filter(sheet => sheet.state === 'visible')).toHaveLength(17);
  expect(previousBook.getWorksheet('_triadic')!.getCell('C1').value).toBe(1);
  expect(await hash()).toBe(original);
});
