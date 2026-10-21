import { test, expect } from '@playwright/test';
test('1万要素があってもスクロール領域だけを探索し、遅れて現れる領域も復元する', async ({ page }) => {
  await page.goto('/tests/ui/table-window.html');
  const result = await page.evaluate(async () => {
    const path = '/Triadichrome-extension/src/extension/windowView.tsx';
    const { captureWindowScroll, restoreWindowScroll } = await import(path);
    const root = document.createElement('section'); root.className = 'home-page'; document.body.append(root);
    const region = document.createElement('div'); region.className = 'home-content'; region.style.cssText = 'height:100px;width:100px;overflow:auto'; root.append(region);
    const inner = document.createElement('div'); inner.style.cssText = 'height:2000px;width:2000px'; region.append(inner);
    for (let i = 0; i < 10000; i++) inner.append(document.createElement('span'));
    region.scrollTop = 400; region.scrollLeft = 300;
    const captured = captureWindowScroll(); region.remove();
    const original = document.querySelectorAll.bind(document);
    let queries = 0, collected = 0;
    document.querySelectorAll = ((selector: string) => { const nodes = original(selector); queries++; collected += nodes.length; return nodes; }) as typeof document.querySelectorAll;
    const started = performance.now(), stop = restoreWindowScroll(captured);
    await new Promise(resolve => setTimeout(resolve, 80));
    region.scrollTop = 0; region.scrollLeft = 0; root.append(region);
    await new Promise(resolve => setTimeout(resolve, 550));
    stop(); document.querySelectorAll = original;
    const value = { top: region.scrollTop, left: region.scrollLeft, queries, collected, ms: performance.now() - started };
    root.remove(); return value;
  });
  expect(result.top).toBe(400); expect(result.left).toBe(300);
  expect(result.queries).toBeLessThan(10); expect(result.collected).toBeLessThan(30);
  console.log('位置復元の探索: ' + JSON.stringify(result));
});
