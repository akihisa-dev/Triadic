import { settleMotion, test, expect } from "./fixtures";

test("背景・名称・線は製品のテーマへ揃え、操作対象のアイコンだけにアクセントを使う", async ({ app }) => {
  await app.getByRole("button", { name: "新規作成", exact: true }).click();
  await app.getByRole("main", { name: "作業を選択", exact: true }).getByRole("button", { name: "一次予算", exact: true }).click();
  await app.getByRole("navigation", { name: "メインナビゲーション" }).getByRole("button", { name: "作業を選択", exact: true }).click();
  await app.getByRole("navigation", { name: "アプリの仕組み", exact: true }).getByRole("button", { name: "関連図", exact: true }).click();
  await settleMotion(app.locator("body"));
  const home = app.getByRole("main", { name: "ホーム", exact: true });
  const target = home.getByRole("button", { name: "施策一覧", exact: true });
  for (const dark of [false, true]) {
    const theme = app.getByRole("switch", { name: "ダークテーマ" });
    await theme.setChecked(dark);
    if (await target.getAttribute("aria-pressed") !== "true") await target.click();
    await expect(target.locator(".home-relation-icon")).toHaveCSS("color", dark ? "rgb(214, 184, 108)" : "rgb(0, 51, 255)");
    await expect(home.locator(".home-relations-viewport")).toHaveCSS("background-color", dark ? "rgb(41, 41, 41)" : "rgb(247, 247, 247)");
    await expect(home.locator(".home-relation.is-active path").first()).toHaveCSS("stroke", dark ? "rgb(140, 140, 140)" : "rgb(139, 139, 139)");
    for (const name of ["施策一覧", "総原価表", "展開表"]) {
      const destination = home.getByRole("button", { name, exact: true });
      await expect(destination).toHaveCSS("background-color", dark ? "rgb(52, 52, 52)" : "rgb(251, 251, 251)");
      await expect(destination).toHaveCSS("color", dark ? "rgb(242, 242, 242)" : "rgb(52, 52, 52)");
      await expect(destination).toHaveCSS("border-color", dark ? "rgb(140, 140, 140)" : "rgb(139, 139, 139)");
    }
    const leaked = await home.locator(".home-relation-name, .home-relation-subnode").evaluateAll(nodes => nodes.some(node => ["rgb(0, 51, 255)", "rgb(214, 184, 108)"].includes(getComputedStyle(node).color)));
    expect(leaked).toBe(false);
  }
});
