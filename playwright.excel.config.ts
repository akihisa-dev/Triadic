import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: ["**/spreadsheet-io.spec.ts", "**/report-parity.spec.ts", "**/workbook-export.spec.ts"],
});
