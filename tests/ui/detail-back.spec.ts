import { test, expect } from './fixtures';

for (const phase of ['待ち時間', '保存中', '保存失敗', '入力不備', '変換中']) test(`施策詳細の戻る操作は${phase}の入力を保護する`, async ({ page, app }) => {
  await page.goto('/tests/ui/preview.html?data=full');
  await expect(page.getByRole('status')).toHaveText('操作できます');
  await app.locator('body').evaluate(() => {
    const target = window as Window & { showOpenFilePicker?: () => Promise<FileSystemFileHandle[]>; saveGate?: { started: boolean; fail: boolean; release?: () => void } };
    const picker = target.showOpenFilePicker!;
    target.showOpenFilePicker = async () => {
      const handles = await picker(), handle = handles[0]!;
      const create = handle.createWritable.bind(handle);
      handle.createWritable = async options => {
        const writer = await create(options), close = writer.close.bind(writer);
        writer.close = async () => {
          const gate = target.saveGate;
          if (gate) {
            gate.started = true;
            await new Promise<void>(resolve => { gate.release = resolve; });
            delete target.saveGate;
            if (gate.fail) throw new Error('戻る操作の保存失敗');
          }
          await close();
        };
        return writer;
      };
      return handles;
    };
  });
  await app.getByRole('button', { name: 'ファイルを開く', exact: true }).click();
  await app.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('button', { name: '施策一覧', exact: true }).click();
  await app.getByRole('button', { name: '既存商品の販売拡大', exact: true }).click();
  const note = app.getByRole('textbox', { name: '備考', exact: true });
  const back = app.getByRole('button', { name: '← 施策一覧へ戻る', exact: true });
  if (phase === '保存中' || phase === '保存失敗') await note.evaluate((_, fail) => {
    (window as Window & { saveGate?: { started: boolean; fail: boolean } }).saveGate = { started: false, fail };
  }, phase === '保存失敗');
  if (phase === '変換中') await note.dispatchEvent('compositionstart');
  await note.fill('戻る操作で保持する備考');
  if (phase === '入力不備') await app.getByRole('textbox', { name: '施策名', exact: true }).fill('');
  if (phase === '保存中' || phase === '保存失敗') await expect.poll(() => note.evaluate(() => (window as Window & { saveGate?: { started: boolean } }).saveGate?.started)).toBe(true);
  expect(await back.isEnabled()).toBe(true);
  await back.click();
  if (phase === '保存中' || phase === '保存失敗') {
    await expect(note).toHaveValue('戻る操作で保持する備考');
    await note.evaluate(() => (window as Window & { saveGate?: { release?: () => void } }).saveGate?.release?.());
  }
  if (phase === '保存失敗' || phase === '入力不備' || phase === '変換中') {
    const message = phase === '保存失敗' ? /^戻る操作の保存失敗$/ : phase === '入力不備' ? /^施策名を入力してください。$/ : /^日本語の変換を確定してください。入力は保持しています。$/;
    await expect(app.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(note).toHaveValue('戻る操作で保持する備考');
    await expect(app.getByRole('heading', { name: '施策入力', exact: true })).toBeVisible();
    if (phase === '変換中') await note.dispatchEvent('compositionend');
  } else {
    await expect(app.getByRole('heading', { name: '施策一覧', exact: true })).toBeVisible();
    await app.getByRole('button', { name: '既存商品の販売拡大', exact: true }).click();
    await expect(note).toHaveValue('戻る操作で保持する備考');
  }
});
