import { test, expect } from "./fixtures";

test("ホームの説明項目は左に縦並びで、最後の項目まで選べる", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  for (const [label, region, content] of [
    ["画面とデータ", "画面とデータの対応図", ".screen-data-content"],
    ["計算の仕組み", "計算の仕組み", ".mechanism-content"],
    ["処理の流れ", "処理の流れ", ".mechanism-content"],
  ] as const) {
    await app.getByRole("button", { name: label, exact: true }).click();
    const view = app.getByRole("region", { name: region, exact: true });
    const nav = view.getByRole("navigation");
    const buttons = nav.getByRole("button");
    const boxes = await buttons.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, bottom: box.bottom };
    }));
    for (let index = 1; index < boxes.length; index++) {
      expect(boxes[index]!.left).toBeCloseTo(boxes[0]!.left);
      expect(boxes[index]!.top).toBeGreaterThanOrEqual(boxes[index - 1]!.bottom);
    }
    const navBox = (await nav.boundingBox())!;
    const contentBox = (await view.locator(content).boundingBox())!;
    expect(contentBox.x).toBeGreaterThanOrEqual(navBox.x + navBox.width);
    expect(contentBox.y).toBeCloseTo(navBox.y);
    expect(await view.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    // A long explanation must not move the list out of reach.
    await view.locator(content).evaluate(node => { node.scrollTop = node.scrollHeight; });
    const last = buttons.last();
    const name = (await last.innerText()).trim();
    await last.press("Enter");
    await expect(last).toHaveAttribute("aria-pressed", "true");
    await expect(view.getByRole("heading", { name, exact: true })).toBeVisible();
    const lastBox = (await last.boundingBox())!;
    expect(lastBox.y).toBeGreaterThanOrEqual(navBox.y);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(navBox.y + navBox.height + 1);
  }
});
