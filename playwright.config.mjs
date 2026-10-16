import { defineConfig } from "@playwright/test";
/* E2E for the client SPA against the local vite dev server, which serves the
   public/api/dataset snapshot at /api/dataset. Implements the xlsx test plan
   (FE and PERF). The /ops operator console (FE-060..066) is a SEPARATE app and is
   not part of this repo, so those cases are skipped here with that reason. */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["junit", { outputFile: "reports/e2e-results.xml" }]],
  use: { baseURL: "http://localhost:5178", headless: true, actionTimeout: 10000 },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5178/",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
