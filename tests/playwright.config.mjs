import { defineConfig } from '@playwright/test';

// 用 python 起靜態伺服器服務 repo 根目錄；serviceWorkers 設 block 讓測試不被
// SW 的自動換手 reload 干擾（SW 本身已另行驗證）。
export default defineConfig({
  testDir: '.',
  timeout: 30000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:8970',
    serviceWorkers: 'block',
    headless: true,
  },
  webServer: {
    command: 'python -m http.server 8970 --directory ..',
    port: 8970,
    reuseExistingServer: true,
    timeout: 20000,
  },
});
