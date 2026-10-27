import { test, expect, settleMotion } from "./fixtures";

const tables = ["施策一覧", "総原価表", "展開表"];

test("関連図の初期配置は三つの対等な表と全14入口を示す", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await expect(home.locator(".home-relation-node")).toHaveCount(14);
  await expect(home.locator(".home-relations-brand")).toHaveText("Triadic");
  await expect(home.locator(".home-relation-subnode:visible")).toHaveCount(0);
  await expect(home.locator(".home-relation.is-peer")).toHaveCount(3);
  const sizes = await home.locator(".home-relation-node.is-core").evaluateAll(nodes => nodes.map(node => [getComputedStyle(node).width, getComputedStyle(node).height]));
  expect(sizes).toEqual(Array.from({ length: 3 }, () => ["128px", "128px"]));
  await expect(home.getByRole("list", { name: "関係の線の意味" }).getByRole("listitem")).toHaveText(["選択・参照", "構成・所属", "金額・計算", "同じ内容の別表示"]);
});

test("表の選択で全体が再配置され、直接の説明だけを表示する", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  const unrelated = home.locator('.home-relation-item:has([data-page="account-type-master"])');
  const before = await unrelated.getAttribute("transform");
  for (const name of tables) {
    const button = home.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(home.locator(".home-relation.is-active")).toHaveCount(name === "施策一覧" ? 10 : name === "総原価表" ? 4 : 3);
    await expect(home.locator(".home-relation-subnode:visible")).toHaveCount(name === "施策一覧" ? 10 : name === "総原価表" ? 4 : 3);
    await expect.poll(async () => {
      const boxes = await Promise.all(tables.map(table => home.getByRole("button", { name: table, exact: true }).boundingBox()));
      const target = boxes[tables.indexOf(name)]!;
      return boxes.every(box => box!.y >= target.y - 1);
    }).toBe(true);
  }
  await expect(unrelated).not.toHaveAttribute("transform", before!);
  await home.locator(".home-relations-viewport").press("Escape");
  await expect(home.locator('.home-relation-node[aria-pressed="true"]')).toHaveCount(0);
  await expect(home.locator(".home-relation-subnode:visible")).toHaveCount(0);
});

test("二度目の操作で画面を開き、戻っても他のホーム表示を使える", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  for (const name of ["総原価表", "勘定科目マスタ"]) {
    const home = app.getByRole("main", { name: "ホーム", exact: true });
    const button = home.getByRole("button", { name, exact: true });
    await button.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.press("Enter");
    await expect(app.getByRole("heading", { name, exact: true })).toBeVisible();
    await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "Home", exact: true }).click();
  }
  await app.getByRole("button", { name: "画面とデータ", exact: true }).click();
  await expect(app.getByRole("region", { name: "画面とデータの対応図" })).toBeVisible();
  await app.getByRole("button", { name: "関連図", exact: true }).click();
  await expect(app.locator(".home-relations-viewport")).toBeVisible();
});

test("ドラッグは画面を開かず選択中の定位置へ戻り、ズームと全体表示を維持する", async ({ app, page }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await home.getByRole("button", { name: "総原価表", exact: true }).click();
  const button = home.getByRole("button", { name: "集計マスタ", exact: true });
  const group = home.locator('.home-relation-item:has([data-page="aggregation-master"])');
  await expect.poll(async () => {
    const before = await group.getAttribute("transform");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return (await group.getAttribute("transform")) === before;
  }).toBe(true);
  const initial = await group.getAttribute("transform");
  const box = (await button.locator(".home-relation-icon").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  await expect(home).toBeVisible();
  await expect.poll(() => group.getAttribute("transform")).toBe(initial);
  const map = home.locator(".home-relations-map");
  const style = await map.getAttribute("style");
  await home.getByRole("button", { name: "拡大", exact: true }).click();
  await expect(map).not.toHaveAttribute("style", style!);
  await home.getByRole("button", { name: "全体表示", exact: true }).click();
});

test("関係線の4種類を、選択と移動の後も維持する", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await home.getByRole("button", { name: "施策一覧", exact: true }).click();
  await expect(home.locator(".home-relations-map .relation-reference path").first()).toHaveCSS("stroke-dasharray", "8px, 5px");
  await expect(home.locator(".home-relations-map .relation-structure path").first()).toHaveCSS("stroke-dasharray", "1px, 5px");
  await expect(home.locator(".home-relations-map .relation-amount path").first()).toHaveCSS("stroke-dasharray", "none");
  expect((await home.locator(".home-relations-map .relation-view path").first().getAttribute("d"))!.match(/M/g)).toHaveLength(2);
});

test("キャンバスは見出しの下から画面下端まで広がる", async ({ page, app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await settleMotion(app.locator("body"));
  for (const height of [800, 1000]) {
    await page.setViewportSize({ width: page.viewportSize()!.width, height });
    const metrics = await app.locator(".home-relations").evaluate(element => {
      const main = element.getBoundingClientRect(), viewport = element.querySelector(".home-relations-viewport")!.getBoundingClientRect();
      return { bottom: main.bottom - viewport.bottom, padding: parseFloat(getComputedStyle(element).paddingBottom), overflow: element.scrollHeight > element.clientHeight };
    });
    expect(metrics.bottom).toBeCloseTo(metrics.padding, 0);
    expect(metrics.overflow).toBe(false);
  }
});

test("各入口を選んでも名称・関係説明・中央の名前が重ならない", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await expect(home.locator(".home-relation-name")).toHaveCount(14);
  const names = await home.locator(".home-relation-name").allTextContents();
  expect(names).toHaveLength(14);
  for (const name of names) {
    const destination = home.getByRole("button", { name, exact: true });
    await destination.press("Space");
    await expect(destination).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => home.locator(".home-relations-map").evaluate(async svg => {
      const groups = [...svg.querySelectorAll("g[transform]")];
      const before = groups.map(group => group.getAttribute("transform"));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return groups.every((group, i) => group.getAttribute("transform") === before[i]);
    })).toBe(true);
    const overlaps = await home.locator(".home-relations-map").evaluate(svg => {
      const labels = [...svg.querySelectorAll(".home-relation-name, .home-relation-subnode, .home-relations-brand strong")].filter(node => getComputedStyle(node).visibility !== "hidden");
      const results: string[] = [];
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]!, b = labels[j]!, x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
        if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) results.push(`${a.textContent}/${b.textContent}`);
      }
      return results;
    });
    expect(overlaps, `${name}の配置`).toEqual([]);
  }
});
