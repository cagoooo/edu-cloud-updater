import { test, expect } from '@playwright/test';

const HEAD = ["學生姓名", "年級", "班級", "座號", "身分證末四碼", "西元出生年月日"];
const NEWHEAD = ["學生姓名", "學號", "年級", "出生日期", "班級", "座號", "證照號碼"];

// 在頁面內用 SheetJS 合成「現有總表(.xlsx 多年級)」與「教育局新名冊(.xls)」並載入。
async function load(page, curSheets, freshRows) {
  await page.evaluate(({ curSheets, freshRows, HEAD }) => {
    function buildCur(sheets) {
      const wb = XLSX.utils.book_new();
      for (const [n, rows] of sheets) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD, ...rows]), n);
      }
      return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    }
    function buildNew(rows) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '學生概況資料');
      return XLSX.write(wb, { type: 'array', bookType: 'xls' });
    }
    return window.__test.load(buildCur(curSheets), buildNew(freshRows));
  }, { curSheets, freshRows, HEAD });
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page._errors = errors;
  await page.goto('/');
  await page.waitForFunction(
    () => window.__test && typeof XLSX !== 'undefined' && typeof ExcelJS !== 'undefined'
  );
});

test.afterEach(async ({ page }) => {
  expect(page._errors, '不應有 console / page 錯誤').toEqual([]);
});

const SCENARIO_TRANSFER = [
  [
    ['一年級', [["小明", 1, 1, 1, "1234", "20180101"], ["阿福", 1, 2, 5, "1234", "20180303"]]],
    ['二年級', [["大雄", 2, 1, 1, "9999", "20170505"]]],
  ],
  [
    ["產製資訊"], [], NEWHEAD,
    ["小明", "S1", 2, "2018-01-01", 3, 7, "A123451234"],
    ["阿福", "S2", 2, "2018-03-03", 1, 3, "H00121234"],
    ["新同學", "S3", 1, "2020-07-07", 1, 1, "M00128888"],
  ],
];

test('轉入轉出 + 升年級同步 + 末四碼撞號', async ({ page }) => {
  await load(page, SCENARIO_TRANSFER[0], SCENARIO_TRANSFER[1]);
  const s = await page.evaluate(() => window.__test.summary());
  expect(s.unchanged).toBe(2);
  expect(s.removed).toBe(1);          // 大雄 轉出
  expect(s.added).toBe(1);            // 新同學 轉入
  expect(s.synced).toBe(2);           // 小明、阿福 升年級
  expect(s.gradeCounts['1']).toBe(1); // 新同學
  expect(s.gradeCounts['2']).toBe(2); // 小明、阿福 升上來
  expect(s.collisions.length).toBe(1);
  expect(s.collisions[0]).toContain('1234');
});

test('升年級開關關閉 → 在校生留原年級', async ({ page }) => {
  await load(page, SCENARIO_TRANSFER[0], SCENARIO_TRANSFER[1]);
  await page.evaluate(() => window.__test.setSync(false));
  const s = await page.evaluate(() => window.__test.summary());
  expect(s.synced).toBe(0);
  expect(s.gradeCounts['1']).toBe(3); // 小明、阿福、新同學
  expect(s.gradeCounts['2']).toBe(0);
});

test('改名偵測 + A-4 視為同一人', async ({ page }) => {
  await load(page, [
    ['一年級', [["小明", 1, 1, 1, "1234", "20180101"], ["李彥丞", 1, 3, 2, "7777", "20190606"]]],
    ['二年級', [["大雄", 2, 1, 1, "9999", "20170505"]]],
  ], [
    ["產製資訊"], [], NEWHEAD,
    ["小明", "S1", 2, "2018-01-01", 3, 7, "A123451234"],
    ["蒲彥丞", "S2", 1, "2019-06-06", 2, 9, "K00127777"],
    ["新同學", "S3", 1, "2020-07-07", 1, 1, "M00128888"],
  ]);

  // 預設「視為同一人」：改名不計轉出轉入
  let e = await page.evaluate(() => window.__test.effective());
  expect(e.renamed).toEqual(['李彥丞->蒲彥丞(改名)']);
  expect(e.removedT).toEqual(['大雄']);
  expect(e.addedT).toEqual(['新同學']);

  // 改名學生不發新生通知單
  const slips = await page.evaluate(() => window.__test.slipsHTML());
  expect(slips).toContain('新同學');
  expect(slips).not.toContain('蒲彥丞');
  expect(slips).toContain('桃園市龍潭區石門國民小學');
  expect(slips).not.toContain('新明');

  // 取消「視為同一人」→ 當作不同人
  await page.evaluate(() => window.__test.setRenameSame(0, false));
  e = await page.evaluate(() => window.__test.effective());
  expect(e.renamed).toEqual([]);
  expect([...e.removedT].sort()).toEqual(['大雄', '李彥丞']);
  expect([...e.addedT].sort()).toEqual(['新同學', '蒲彥丞']);

  // 輸出總表不受 A-4 影響（完整 removed/added 不變）
  const s = await page.evaluate(() => window.__test.summary());
  expect(s.removed).toBe(2);
  expect(s.added).toBe(2);
});

test('資料健檢偵測異常', async ({ page }) => {
  await load(page, [['一年級', [["王小明", 1, 1, 1, "1234", "20180101"]]]], [
    ["產製資訊"], [], NEWHEAD,
    ["王小明", "S1", 1, "2018-01-01", 1, 1, "A001234"],
    ["李大華", "S2", 1, "2018", 1, 1, "B005678"],   // 生日異常 + 與王小明同班同座
    ["陳小美", "S3", 1, "2019-02-02", 1, 2, ""],      // 缺末四碼
  ]);
  const h = await page.evaluate(() => window.__test.healthCounts());
  expect(h.fresh.badBday).toBe(1);
  expect(h.fresh.missingLast4).toBe(1);
  expect(h.fresh.dupSeat).toBe(1);
});

test('乾淨資料健檢通過、無撞號、可匯出', async ({ page }) => {
  await load(page, [['一年級', [["王小明", 1, 1, 1, "1234", "20180101"]]]], [
    ["產製資訊"], [], NEWHEAD,
    ["王小明", "S1", 1, "2018-01-01", 1, 1, "A001234"],
    ["李小華", "S2", 1, "2018-02-02", 1, 2, "B005678"],
  ]);
  const s = await page.evaluate(() => window.__test.summary());
  expect(s.collisions).toEqual([]);
  const h = await page.evaluate(() => window.__test.healthCounts());
  expect(h.fresh.badBday).toBe(0);
  expect(h.fresh.missingLast4).toBe(0);
  const size = await page.evaluate(() => window.__test.exportSize());
  expect(size).toBeGreaterThan(1000);
  const clog = await page.evaluate(() => window.__test.changeLogSize());
  expect(clog).toBeGreaterThan(1000);
});
