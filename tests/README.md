# 自動化測試（Playwright）

透過頁面內的 `window.__test` 鉤子，用 headless 瀏覽器以固定樣本驗證核心邏輯，避免日後改程式不小心改壞比對。

## 涵蓋情境（5 組）
1. 轉入轉出 + 升年級同步 + 末四碼撞號
2. 升年級開關關閉 → 在校生留原年級
3. 改名偵測 + A-4「視為同一人」（含改名學生不發新生通知單、學校名正確）
4. 資料健檢偵測異常（生日格式／缺末四碼／同班座號重複）
5. 乾淨資料健檢通過、無撞號、可匯出（總表 + 異動清冊）

每個測試也會斷言「無 console／page 錯誤」。

## 執行
```bash
cd tests
npm install                       # 第一次
npx playwright install chromium   # 第一次（下載 headless 瀏覽器）
npm test                          # = npx playwright test
```

`playwright.config.mjs` 會自動用 `python -m http.server 8970 --directory ..` 起靜態站再跑測試（`serviceWorkers: 'block'` 避免 SW 換手 reload 干擾）。
