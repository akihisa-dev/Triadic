import { test, expect, settleMotion } from "./fixtures";

test("操作説明を置かず、ホームのキャンバスを画面下端まで広げる", async ({ page, app }, testInfo) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await settleMotion(app.locator("body"));
  let firstHeight = 0;
  for (const height of [800, 1200]) {
    await page.setViewportSize({ width: page.viewportSize()!.width, height });
    await settleMotion(app.locator("body"));
    const metrics = await app.locator(".home-relations").evaluate(element => {
      const main = element.getBoundingClientRect();
      const viewport = element.querySelector(".home-relations-viewport")!.getBoundingClientRect();
      return { bottom: main.bottom - viewport.bottom, padding: parseFloat(getComputedStyle(element).paddingBottom),
        height: viewport.height, viewportBottom: window.innerHeight - main.bottom,
        overflow: element.scrollHeight > element.clientHeight };
    });
    expect(metrics.bottom).toBeCloseTo(metrics.padding, 0);
    expect(metrics.overflow).toBe(false);
    expect(Math.abs(metrics.viewportBottom)).toBeLessThan(1);
    if (height === 800) firstHeight = metrics.height;
    else expect(metrics.height - firstHeight).toBeCloseTo(400, 0);
    await expect(app.getByText(/クリックで開く · 項目をドラッグ/)).toHaveCount(0);
    await expect(app.getByRole("button", { name: "全体表示", exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 800 });
  await settleMotion(app.locator("body"));
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await settleMotion(app.locator("body"));
  }
  await page.screenshot({ path: `/private/tmp/triadic-home-canvas-${testInfo.project.name}.png` });
});

test("相関図の各入口と、選択後クリック・キーボードの画面移動", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await expect(app.getByRole("main", { name: "ホーム", exact: true })).toBeVisible();
  const navigation = app.getByRole("navigation", { name: "メインナビゲーション" });
  const screenNames = (await navigation.getByRole("button").allTextContents()).map(name => name.trim()).filter(name => name !== "Home" && name !== "マスタ" && name !== "履歴" && name !== "入出力");
  await navigation.getByRole("button", { name: "マスタ", exact: true }).click();
  await expect(app.locator(".master-menu-item strong").first()).toBeVisible();
  const masterNames = await app.locator(".master-menu-item strong").allTextContents();
  const destinations = [...masterNames, ...screenNames];
  await navigation.getByRole("button", { name: "Home", exact: true }).click();
  for (const name of destinations) {
    const home = app.getByRole("main", { name: "ホーム", exact: true });
    await settleMotion(app.locator("body"));
    await home.getByRole("button", { name: "全体表示", exact: true }).click();
    await expect(home.locator(".home-relation-node")).toHaveCount(destinations.length);
    expect((await home.locator(".home-relation-node").allTextContents()).sort()).toEqual([...destinations].sort());
    await home.getByRole("button", { name, exact: true }).locator(".home-relation-name").click();
    await expect(home.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(home).toBeVisible();
    await home.getByRole("button", { name, exact: true }).locator(".home-relation-name").click();
    await expect(app.getByRole("heading", { name, exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: "Home", exact: true }).click();
  }
  await app.getByRole("main", { name: "ホーム", exact: true }).getByRole("button", { name: "施策一覧", exact: true }).press("Enter");
  await expect(app.getByRole("main", { name: "ホーム", exact: true })).toBeVisible();
  await app.locator('.home-relation-node[data-page="initiative-list"]').press("Enter");
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});

test("ドラッグには接続線が追従し、離すと元の配置へ滑らかに戻る", async ({ page, app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await settleMotion(app.locator("body"));
  const input = home.getByRole("button", { name: "施策一覧", exact: true });
  const map = home.locator(".home-relations-map");
  const box = (await input.boundingBox())!;
  const icon = (await input.locator(".home-relation-icon").boundingBox())!;
  const center = { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 };
  const line = home.locator(".home-relation").filter({ hasText: "科目を選択" }).locator("path").last();
  const path = await line.getAttribute("d");
  const neighbor = home.locator('.home-relation-item:has([data-page="account-master"])');
  const neighborBefore = (await neighbor.boundingBox())!;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  const camera = await map.getAttribute("style");
  await page.mouse.move(center.x + 90, center.y + 30, { steps: 6 });
  const dragged = (await input.boundingBox())!;
  expect(dragged.x - box.x).toBeGreaterThan(80);
  await expect(line).not.toHaveAttribute("d", path!);
  await expect(map).toHaveAttribute("style", camera!);
  const neighborAfter = (await neighbor.boundingBox())!;
  expect(neighborAfter.x).toBeCloseTo(neighborBefore.x, 1);
  expect(neighborAfter.y).toBeCloseTo(neighborBefore.y, 1);
  // Capture before React handles the real release and after its handler in the same event task.
  // No animation frame can run between these two measurements.
  await input.evaluate(node => {
    window.addEventListener("pointerup", () => {
      const before = node.getBoundingClientRect();
      window.addEventListener("pointerup", () => {
        const after = node.getBoundingClientRect();
        node.setAttribute("data-release-delta", JSON.stringify([after.x - before.x, after.y - before.y]));
      }, { once: true });
    }, { once: true, capture: true });
  });
  await page.mouse.up();
  const releaseDelta = JSON.parse((await input.getAttribute("data-release-delta"))!) as number[];
  expect(releaseDelta).toHaveLength(2);
  for (const delta of releaseDelta) expect(Math.abs(delta)).toBeLessThan(1);
  await expect(home).toBeVisible();
  await expect.poll(async () => Math.abs((await input.boundingBox())!.x - box.x)).toBeLessThan(.1);
  await input.locator(".home-relation-name").click();
  await expect(input).toHaveAttribute("aria-pressed", "true");
  await input.locator(".home-relation-name").click();
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});

test("背景のドラッグ・ズーム・現在の配置への全体表示と画面往復での保持", async ({ page, app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  const viewport = home.getByRole("region", { name: "画面とマスタの相関図" });
  const map = home.locator(".home-relations-map");
  await settleMotion(app.locator("body"));
  const original = await map.getAttribute("style");
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(bounds.x + 5, bounds.y + 5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 45, bounds.y + 35, { steps: 5 });
  await page.mouse.up();
  await expect(map).not.toHaveAttribute("style", original!);
  await viewport.focus();
  await viewport.press("+");
  await map.evaluate(async node => {
    let previous = "", stable = 0;
    const start = performance.now();
    while (stable < 3 && performance.now() - start < 2000) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const current = node.getAttribute("style")!;
      stable = current === previous ? stable + 1 : 0;
      previous = current;
    }
  });
  const saved = await map.getAttribute("style");
  await home.getByRole("button", { name: "施策一覧", exact: true }).press("Space");
  await home.getByRole("button", { name: "施策一覧", exact: true }).press("Space");
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "Home", exact: true }).click();
  await settleMotion(app.locator("body"));
  await expect(map).toHaveAttribute("style", saved!);
  await home.getByRole("button", { name: "全体表示", exact: true }).click();
  await expect.poll(() => viewport.evaluate(viewport => {
    const box = viewport.getBoundingClientRect();
    return [...viewport.querySelectorAll(".home-relation-node")].every(node => {
      const rect = node.getBoundingClientRect();
      return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom;
    });
  })).toBe(true);
});

test("ホバーとフォーカスで直接の関係を強調し、すべての説明を読み取れる", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await settleMotion(app.locator("body"));
  await expect(home.locator(".home-relation-icon svg")).toHaveCount(13);
  await expect(home.locator(".home-relation-subnode")).toHaveCount(17);
  await expect(home.locator(".home-relations-map .home-relation path")).toHaveCount(34);
  await expect(home.locator(".home-relation-subnode").first()).toBeVisible();
  const input = home.getByRole("button", { name: "施策一覧", exact: true });
  const sizes = await home.locator(".home-relation-icon svg").evaluateAll(icons => icons.map(icon => ({ entry: !!icon.closest(".is-entry"), width: Number.parseFloat(getComputedStyle(icon).width) })));
  expect(sizes.filter(icon => icon.entry)[0]!.width).toBeGreaterThan(Math.max(...sizes.filter(icon => !icon.entry).map(icon => icon.width)));
  await input.locator(".home-relation-icon").hover();
  await expect(home.locator(".home-relation.is-active")).toHaveCount(10);
  await input.focus();
  await expect(home.locator(".home-relation.is-active")).toHaveCount(10);
  await expect(home.locator(".home-relation > title")).toHaveCount(17);
  await expect(home.locator(".home-relation text, .home-relation rect")).toHaveCount(0);
  await expect(input.locator(".home-relation-icon")).toHaveCSS("color", "rgb(0, 51, 255)");
  await expect(home.locator(".home-relation.is-active path").first()).toHaveCSS("stroke-opacity", "0.55");
});

test("ズームは中間倍率を通り、途中反転しても連続する", async ({ app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await settleMotion(app.locator("body"));
  const map = home.locator(".home-relations-map");
  const scale = () => map.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).a);
  await map.evaluate(async node => {
    let previous = "", stable = 0;
    const start = performance.now();
    while (stable < 4 && performance.now() - start < 12000) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const current = node.getAttribute("style")!;
      stable = current === previous ? stable + 1 : 0;
      previous = current;
    }
    if (stable < 4) throw new Error("初期配置の全体表示が収束しませんでした");
  });
  const initial = await scale();
  await home.getByRole("button", { name: "拡大", exact: true }).click();
  const frames = await map.evaluate(async node => {
    const values: number[] = [];
    for (let i = 0; i < 8; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      values.push(new DOMMatrix(getComputedStyle(node).transform).a);
    }
    return values;
  });
  expect(frames.some(value => value > initial && value < initial * 1.25 - .001)).toBe(true);
  expect(new Set(frames).size).toBeGreaterThan(2);
  const reversal = map.evaluate(node => new Promise<number[]>(resolve => {
    const scale = () => new DOMMatrix(getComputedStyle(node).transform).a;
    const button = node.closest("main")!.querySelector<HTMLButtonElement>('[aria-label="縮小"]')!;
    button.addEventListener("click", () => {
      const before = scale();
      queueMicrotask(async () => {
        const values = [before, scale()];
        for (let i = 0; i < 8; i++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          values.push(scale());
        }
        resolve(values);
      });
    }, { once: true });
  }));
  await home.getByRole("button", { name: "縮小", exact: true }).click();
  const reversed = await reversal;
  expect(Math.abs(reversed[1]! - reversed[0]!)).toBeLessThan(.001);
  expect(reversed.at(-1)!).toBeLessThan(reversed[0]!);
  expect(new Set(reversed).size).toBeGreaterThan(2);
  await expect.poll(scale).toBeCloseTo(initial, 3);
});

test("タッチのピンチで拡大し、項目を誤って開かない", async ({ page, app, context }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await settleMotion(app.locator("body"));
  const map = home.locator(".home-relations-map");
  const initial = await map.getAttribute("style");
  const box = (await home.getByRole("region", { name: "画面とマスタの相関図" }).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const session = await context.newCDPSession(page);
  const touches = (distance: number) => [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touches(20) });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touches(40) });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(home).toBeVisible();
  await expect(map).not.toHaveAttribute("style", initial!);
  await session.detach();
});

test("動きを減らす設定でも項目は自由に動かせ、移動後の操作を保持する", async ({ page, app }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await settleMotion(app.locator("body"));
  const input = home.getByRole("button", { name: "施策一覧", exact: true });
  const box = (await input.boundingBox())!;
  const icon = (await input.locator(".home-relation-icon").boundingBox())!;
  await page.mouse.move(icon.x + icon.width / 2, icon.y + icon.height / 2);
  await page.mouse.down();
  await page.mouse.move(icon.x + icon.width / 2 + 80, icon.y + icon.height / 2, { steps: 5 });
  expect((await input.boundingBox())!.x - box.x).toBeGreaterThan(70);
  await page.mouse.up();
  await expect(home).toBeVisible();
  await input.press("Enter");
  await input.press("Enter");
  await expect(app.getByRole("heading", { name: "施策一覧", exact: true })).toBeVisible();
});


test("関係サブノードを動かすと両側の線が追従し、画面を開かない", async ({ page, app }) => {
  await app.getByRole("button", { name: "ファイルを開く", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await settleMotion(app.locator("body"));
  const relation = home.locator(".home-relation").filter({ hasText: "科目を選択" });
  const subnode = relation.locator(".home-relation-subnode");
  await home.getByRole("button", { name: "施策一覧", exact: true }).click();
  await subnode.hover();
  await expect(home.locator(".home-relation.is-active")).toHaveCount(1);
  const before = await relation.locator("path").evaluateAll(paths => paths.map(path => path.getAttribute("d")));
  const box = (await subnode.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 - 30, { steps: 6 });
  await page.mouse.up();
  await expect(home).toBeVisible();
  await expect.poll(() => relation.locator("path").evaluateAll(paths => paths.map(path => path.getAttribute("d")))).not.toEqual(before);
  await subnode.click();
  await expect(home).toBeVisible();
  await subnode.focus();
  await subnode.press("Enter");
  await expect(home).toBeVisible();
});


test("初期配置は関係ごとに分散し、説明が重ならず、操作前に密集しない", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await settleMotion(app.locator("body"));
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  const metrics = await home.locator(".home-relations-map").evaluate(async svg => {
    const items = [...svg.querySelectorAll(".home-relation-node, .home-relation-subnode")];
    const boxes = items.map(item => item.getBoundingClientRect());
    const overlaps = items.flatMap((item, i) => boxes.slice(i + 1).flatMap((b, j) => {
      const a = boxes[i]!;
      return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        ? [`${item.textContent} / ${items[i + j + 1]!.textContent}`] : [];
    }));
    const crossings: string[] = [];
    const shortConnections: string[] = [];
    for (const path of svg.querySelectorAll<SVGPathElement>(".home-relation path")) {
      const length = path.getTotalLength(), matrix = path.getScreenCTM()!;
      const strokes = path.getAttribute("d")!.match(/M/g)!.length;
      if (length / strokes < 18) shortConnections.push(path.parentElement!.querySelector("title")!.textContent!);
      for (let step = 1; step < 40; step++) {
        const point = path.getPointAtLength(length * step / 40).matrixTransform(matrix);
        items.forEach((item, index) => {
          if (path.parentElement!.contains(item)) return;
          const box = boxes[index]!;
          if (point.x > box.left + 1 && point.x < box.right - 1 && point.y > box.top + 1 && point.y < box.bottom - 1)
            crossings.push(`${path.parentElement!.querySelector("title")!.textContent} / ${item.textContent}`);
        });
      }
    }
    const groups = [...svg.querySelectorAll("g[transform]")];
    const before = groups.map(group => group.getAttribute("transform"));
    for (let i = 0; i < 30; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const box = (page: string) => svg.querySelector(`[data-page="${page}"]`)!.getBoundingClientRect();
    const x = (page: string) => box(page).x;
    return { overlaps, shortConnections, crossings: [...new Set(crossings)], stable: groups.every((group, i) => group.getAttribute("transform") === before[i]),
      center: x("initiative-list"), account: x("account-master"), department: x("department-master"),
      cost: x("cost-table"), expansion: x("expansion-table") };
  });
  expect(metrics.overlaps).toEqual([]);
  expect(metrics.crossings).toEqual([]);
  expect(metrics.shortConnections, "説明の両端に接続線の長さを確保する").toEqual([]);
  expect(metrics.stable).toBe(true);
  expect(metrics.account).toBeCloseTo(metrics.center, 1);
  expect(metrics.department).toBeLessThan(metrics.center);
  expect(metrics.cost).toBeGreaterThan(metrics.center);
  expect(metrics.expansion).toBeGreaterThan(metrics.center);
});


test("画面外の関係説明へTabで移動すると枠まで表示し、説明から図を操作できる", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await settleMotion(app.locator("body"));
  const viewport = app.getByRole("region", { name: "画面とマスタの相関図" });
  const map = app.locator(".home-relations-map");
  const descriptions = app.locator(".home-relation-subnode");
  await viewport.focus();
  for (let i = 0; i < 20; i++) await viewport.press("ArrowLeft");
  await viewport.press("+");
  await settleMotion(app.locator("body"));
  const hidden = await descriptions.first().evaluate(node => {
    const box = node.closest(".home-relations-viewport")!.getBoundingClientRect(), rect = node.getBoundingClientRect();
    return rect.right < box.left || rect.left > box.right;
  });
  expect(hidden).toBe(true);
  await viewport.press("Tab");
  const visible = (node: Element) => {
    const box = node.closest(".home-relations-viewport")!.getBoundingClientRect(), rect = node.getBoundingClientRect();
    return rect.left >= box.left + 2 && rect.right <= box.right - 2 && rect.top >= box.top + 2 && rect.bottom <= box.bottom - 2;
  };
  for (let i = 0; i < 17; i++) {
    const description = descriptions.nth(i);
    await expect(description).toBeFocused();
    expect(await description.evaluate(visible)).toBe(true);
    await expect(app.locator(".home-relation.is-active")).toHaveCount(1);
    if (i < 16) await description.press("Tab");
  }
  for (let i = 16; i > 0; i--) {
    await descriptions.nth(i).press("Shift+Tab");
    await expect(descriptions.nth(i - 1)).toBeFocused();
    expect(await descriptions.nth(i - 1).evaluate(visible)).toBe(true);
  }
  const before = await map.getAttribute("style");
  await descriptions.first().press("ArrowLeft");
  await expect(map).not.toHaveAttribute("style", before!);
  const pan = await map.getAttribute("style");
  await descriptions.first().press("Home");
  await expect(map).not.toHaveAttribute("style", pan!);
  await settleMotion(app.locator("body"));
  expect(await descriptions.first().evaluate(visible)).toBe(true);
});


test("別項目は選択だけを切り替え、背景とEscapeで解除し、ドラッグでも開かない", async ({ page, app }, testInfo) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await settleMotion(app.locator("body"));
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  const account = home.getByRole("button", { name: "勘定科目マスタ", exact: true });
  const initiative = home.getByRole("button", { name: "施策一覧", exact: true });
  await account.click();
  await expect(account).toHaveAttribute("aria-pressed", "true");
  await initiative.click();
  await expect(initiative).toHaveAttribute("aria-pressed", "true");
  await expect(account).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: `/private/tmp/triadic-relations-selected-${testInfo.project.name}.png` });
  await initiative.press("Escape");
  await expect(initiative).toHaveAttribute("aria-pressed", "false");
  await account.click();
  const viewport = home.locator(".home-relations-viewport");
  await viewport.click({ position: { x: 5, y: 5 } });
  await expect(account).toHaveAttribute("aria-pressed", "false");
  await expect(home).toBeVisible();
});


test("関係の意味を4種類の線と凡例で区別し、選択中も線種を維持する", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  await expect(home.getByRole("list", { name: "関係の線の意味" }).getByRole("listitem")).toHaveText(["選択・参照", "構成・所属", "金額・計算", "同じ内容の別表示"]);
  const paths = home.locator(".home-relations-map .home-relation");
  await expect(paths.filter({ hasText: "前年の実額" })).toHaveAttribute("data-kind", "amount");
  await expect(paths.filter({ hasText: "グループ分け" })).toHaveAttribute("data-kind", "structure");
  await expect(paths.filter({ hasText: "科目を選択" })).toHaveAttribute("data-kind", "reference");
  await expect(paths.filter({ hasText: "同じ内容を科目別に確認" })).toHaveAttribute("data-kind", "view");
  await home.getByRole("button", { name: "施策一覧", exact: true }).click();
  await expect(home.locator(".home-relations-map .relation-reference path").first()).toHaveCSS("stroke-dasharray", "8px, 5px");
  await expect(home.locator(".home-relations-map .relation-structure path").first()).toHaveCSS("stroke-dasharray", "1px, 5px");
  await expect(home.locator(".home-relations-map .relation-amount path").first()).toHaveCSS("stroke-dasharray", "none");
  expect((await home.locator(".home-relations-map .relation-view path").first().getAttribute("d"))!.match(/M/g)).toHaveLength(2);
});
