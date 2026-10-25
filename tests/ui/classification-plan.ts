import type { Page } from "@playwright/test";

// This synthetic plan belongs to classification tests, not the business sample.
export async function installClassificationPlan() {
  const { createSamplePlan } = await import("./sample-plan");
  const { changeDepartmentMaster } = await import("../../Triadic-extension/src/core/storage/departmentMaster");
  const { installMemoryFiles } = await import("./memory-files");
  let bytes = await createSamplePlan();
  bytes = await changeDepartmentMaster(bytes, { type: "add", departmentName: "単一業種確認部署", industryIds: [3] });
  bytes = await changeDepartmentMaster(bytes, { type: "add", departmentName: "複数業種確認部署", industryIds: [1, 2] });
  const target = document.querySelector<HTMLIFrameElement>("#app-preview")!.contentWindow!;
  installMemoryFiles({ bytes: Array.from(bytes), scenario: "normal" }, target as Window & typeof globalThis);
}

export async function prepareClassificationPlan(page: Page) {
  await page.goto("/tests/ui/preview.html");
  await page.getByRole("status").filter({ hasText: "操作できます" }).waitFor();
  await page.evaluate(async path => (await import(path)).installClassificationPlan(), "/tests/ui/classification-plan.ts");
}
