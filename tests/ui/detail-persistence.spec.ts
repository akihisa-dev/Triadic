import { test, expect, settleMotion } from './fixtures';
import type { FrameLocator } from '@playwright/test';

async function details(app: FrameLocator) {
  await app.getByRole('navigation', {name:'メインナビゲーション'}).getByRole('button',{name:'明細',exact:true}).click();
  await app.getByRole('button',{name:'全パーツの保存確認を開く',exact:true}).click();
  await expect(app.locator('.detail-part')).toHaveCount(9);
}
async function text(app: FrameLocator, value: string) {
  await app.getByRole('button',{name:'パーツ 1のテキストを編集',exact:true}).dblclick();
  await app.getByRole('textbox',{name:'パーツ 1の説明文'}).fill(value);
  await app.getByRole('textbox',{name:'パーツ 1の説明文'}).press('Escape');
}

test('画像・文章・表・配置を自動保存し、閉じて再開・取消・履歴・別名保存で保持する',async({page,app},info)=>{
  await page.goto('/tests/ui/preview.html?data=full');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await details(app);
  const img=app.getByRole('img',{name:'確認用.png',exact:true});
  await expect(img).toBeVisible();
  await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(8);
  const src=await img.getAttribute('src');
  await text(app,'閉じる直前の入力も保存');
  // Navigation must flush the 600ms pending edit immediately.
  await app.getByRole('button',{name:'一覧に戻る',exact:true}).click();
  await app.getByRole('button',{name:'全パーツの保存確認を開く',exact:true}).click();
  await expect(app.getByRole('button',{name:'パーツ 1のテキストを編集',exact:true})).toHaveText('閉じる直前の入力も保存');
  const imagePart=app.locator('.detail-part').nth(1);
  await imagePart.focus(); await imagePart.press('ArrowRight');
  await settleMotion(app.locator('body'));
  const location=await imagePart.getAttribute('style');
  await app.getByRole('button',{name:'別名で保存',exact:true}).click();
  await expect(app.locator('.home-file-name')).toHaveText('画面テスト のコピー.triadic');
  await expect(imagePart).toHaveAttribute('aria-disabled','false');
  // Leaving the save button collapses the sidebar and moves the canvas.
  await app.getByRole('heading',{name:'全パーツの保存確認',exact:true}).hover();
  await settleMotion(app.locator('body'));
  await imagePart.hover();
  const remove = imagePart.getByRole('button',{name:'パーツ 2を削除',exact:true});
  await expect(remove).toHaveCSS('opacity','1');
  await remove.click();
  await expect(img).toHaveCount(0);
  await app.getByRole('button',{name:'操作を取り消す',exact:true}).click();
  await expect(img).toHaveAttribute('src',src!);
  await expect(imagePart).toHaveAttribute('style',location!);
  await page.screenshot({path:`/tmp/triadichrome-detail-saved-${info.project.name}.png`});
  await app.getByRole('button',{name:'閉じる',exact:true}).click();
  await app.getByRole('alertdialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await app.getByRole('button',{name:'続きから',exact:true}).click();
  await details(app);
  await expect(img).toHaveAttribute('src',src!);
  await expect(app.getByRole('button',{name:'パーツ 1のテキストを編集',exact:true})).toHaveText('閉じる直前の入力も保存');
  await expect(app.getByRole('table',{name:'パーツ 3の表',exact:true})).toContainText('単価');
  await expect(app.getByRole('table',{name:'パーツ 4の表',exact:true})).toContainText('人数');
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'履歴',exact:true}).click();
  await app.locator('.history-date').first().click();
  await details(app);
  await expect(img).toHaveAttribute('src',src!);
  await expect(app.getByRole('button',{name:'画像パーツを追加',exact:true})).toBeDisabled();
  await expect(app.getByRole('button',{name:'パーツ 1のテキストを編集',exact:true})).toHaveAttribute('aria-disabled','true');
});

test('作成と自動保存の失敗では入力を残し、再試行または入力取消ができる',async({page,app})=>{
  await page.goto('/tests/ui/preview.html?data=full&scenario=save-failure');
  await app.getByRole('button',{name:'ファイルを開く',exact:true}).click();
  await app.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name:'明細',exact:true}).click();
  await app.getByRole('button',{name:'＋ 明細を追加',exact:true}).click();
  const dialog=app.getByRole('dialog',{name:'明細を追加',exact:true});
  await dialog.getByRole('textbox',{name:'明細名'}).fill('失敗しても残す名前');
  await dialog.getByRole('button',{name:'次へ',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('保存失敗');
  await expect(dialog.getByRole('textbox',{name:'明細名'})).toHaveValue('失敗しても残す名前');
  await dialog.getByRole('button',{name:'キャンセル',exact:true}).click();
  await app.getByRole('button',{name:'全パーツの保存確認を開く',exact:true}).click();
  await text(app,'失敗しても残す文章');
  await expect(app.getByRole('alert')).toContainText('自動保存できませんでした');
  await expect(app.getByRole('button',{name:'パーツ 1のテキストを編集',exact:true})).toHaveText('失敗しても残す文章');
  await app.getByRole('button',{name:'保存を再試行',exact:true}).click();
  await expect(app.getByRole('alert')).toContainText('自動保存できませんでした');
  await app.getByRole('button',{name:'入力を取り消す',exact:true}).click();
  await expect(app.getByRole('alert')).toHaveCount(0);
  await expect(app.getByRole('button',{name:'パーツ 1のテキストを編集',exact:true})).toContainText('見積と月別');
});
