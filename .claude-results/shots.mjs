import { chromium } from "playwright";
const dir = process.env.SHOTS; await import("node:fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text().slice(0, 200)); });
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true }); console.log("shot", name); };
const step = async (label, fn) => { try { await fn(); } catch (e) { console.log("FAILED at", label, String(e).slice(0, 300)); await shot("zz-failed-" + label.replace(/\W+/g, "-")); throw e; } };

// Fake AI replies (no real AI is called): 1st has no date and items that don't add up; 2nd is clean.
const replies = [
  { description: "B&Q", date: null, amount: 29.95, debit_account: "Expenses:Cost of Sales:Materials", credit_account: "Assets:Cash",
    amount_confidence: 0.6, category_confidence: 0.9, uncertain_about: "The date is faded.",
    line_items: [{ description: "Paint", total: 15.0 }, { description: "Brushes", total: 12.4 }] },
  { description: "Screwfix", date: "2026-10-30", amount: 12.4, debit_account: "Expenses:Cost of Sales:Materials", credit_account: "Assets:Cash",
    amount_confidence: 0.95, category_confidence: 0.95, uncertain_about: null },
];
let calls = 0;
await page.route("https://openrouter.ai/**", async (route) => {
  if (!route.request().url().includes("chat/completions")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  const r = replies[Math.min(calls++, replies.length - 1)];
  await route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(r) } }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.001 } }) });
});

try {
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await step("boot", async () => { await page.getByRole("button", { name: /continue/i }).waitFor({ timeout: 20000 }); });
  await step("country", async () => { await page.getByRole("button", { name: /continue/i }).click(); });
  await step("vault", async () => {
    await page.getByPlaceholder("Minimum 8 characters").fill("correct horse battery");
    await page.getByPlaceholder("Repeat exactly").fill("correct horse battery");
    await page.getByRole("button", { name: /lock my ledger/i }).click();
    await page.getByText("Save your recovery key").waitFor({ timeout: 20000 });
  });
  const groups = await page.locator("code").allTextContents();
  await step("save-key", async () => { await page.getByRole("button", { name: /download/i }).click(); await page.getByRole("button", { name: /saved it, check it/i }).click(); });
  await step("type-groups", async () => {
    const txt = await page.getByText(/type group/).textContent();
    const nums = [...txt.matchAll(/group (\d+)/g)].map((m) => Number(m[1]));
    const inputs = page.locator("input");
    await inputs.nth(0).fill(groups[nums[0] - 1]); await inputs.nth(1).fill(groups[nums[1] - 1]);
    await page.getByRole("button", { name: /^check$/i }).click();
    await page.getByText("Question 1 of 4").waitFor({ timeout: 10000 });
  });
  await step("answers", async () => {
    await page.getByRole("button", { name: /completely private/i }).click();
    await page.getByRole("button", { name: /has to be free/i }).click();
    await page.getByRole("button", { name: /google drive, onedrive/i }).click();
    await page.getByRole("button", { name: /no, it's fine/i }).click();
    await page.getByRole("button", { name: /^choose this$/i }).click();
    await page.getByRole("button", { name: /dashboard/i }).click();
  });
  await page.waitForTimeout(1500);
  await step("key", async () => {
    await page.getByRole("button", { name: /^more$/i }).click();
    await page.getByPlaceholder("sk-or-v1-...").fill("sk-or-v1-test-only");
    await page.getByRole("button", { name: /save key/i }).click();
  });

  // 1) AI reading with no date and items that don't add up.
  const rp0 = await browser.newPage({ viewport: { width: 420, height: 520 } });
  await rp0.setContent(`<body style="margin:0;background:#fff;font:22px 'Courier New',monospace;color:#111;padding:24px;line-height:1.5">
    <div style="font-size:28px;font-weight:bold">B&amp;Q</div><div style="color:#bbb">0?/1?/2026</div><br>
    <div>PAINT &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 15.00</div><div>BRUSHES &nbsp; &nbsp; &nbsp; &nbsp; 12.40</div>
    <div style="font-weight:bold">TOTAL &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 29.95</div></body>`);
  await rp0.screenshot({ path: `${dir}/receipt-bq.png` });
  await rp0.close();
  await step("ai-1", async () => {
    await page.getByRole("button", { name: /scan a receipt or add/i }).click();
    await page.getByRole("button", { name: /ai parse/i }).click();
    await page.locator('input[type="file"]').first().setInputFiles(`${dir}/receipt-bq.png`);
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /parse & save draft/i }).click();
    await page.getByRole("button", { name: /read just this one with ai/i }).click();
    await page.getByText("Full attention needed").first().waitFor({ timeout: 15000 });
  });
  await shot("01-ai-no-date-confirm");
  console.log("CONFIRM TEXT", (await page.locator("body").innerText()).match(/Worth a second look[\s\S]{0,900}/)?.[0]?.replace(/\n+/g, " | "));
  await step("fill-missing", async () => { await page.getByRole("button", { name: /fill in what's missing/i }).click(); });
  const dateVal = await page.locator('input[type="date"]').first().inputValue();
  console.log("DATE AFTER FILL-IN:", JSON.stringify(dateVal));
  await step("save-no-date", async () => { await page.getByRole("button", { name: /save to pending review/i }).click(); });
  await shot("02-manual-needs-date");
  console.log("ERROR SHOWN:", (await page.getByText(/enter the date from the receipt/i).count()) > 0);

  // 2) A clean AI reading still asks for full attention.
  await step("ai-2", async () => {
    await page.getByRole("button", { name: /ai parse/i }).click();
    await page.locator("textarea").first().fill("Screwfix receipt");
    await page.getByRole("button", { name: /parse & save draft/i }).click();
    await page.getByRole("button", { name: /read just this one with ai/i }).click();
    await page.getByRole("button", { name: /i've checked it, save/i }).waitFor({ timeout: 15000 });
  });
  await shot("03-ai-clean-confirm");
  await step("save-clean", async () => { await page.getByRole("button", { name: /i've checked it, save/i }).click(); await page.getByText(/saved to pending review/i).waitFor({ timeout: 10000 }); });

  // 3) Bulk receipts read on the phone, one receipt with no date on it.
  const rp = await browser.newPage({ viewport: { width: 420, height: 480 } });
  await rp.setContent(`<body style="margin:0;background:#fff;font:22px 'Courier New',monospace;color:#111;padding:24px;line-height:1.5">
    <div style="font-size:28px;font-weight:bold">CORNER HARDWARE</div><br>
    <div>SCREWS &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 3.20</div><div>FILLER &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 5.75</div>
    <div style="font-weight:bold">TOTAL &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;8.95</div></body>`);
  await rp.screenshot({ path: `${dir}/receipt-no-date.png` });
  await rp.close();
  await step("bulk", async () => {
    await page.getByRole("button", { name: /^home$/i }).click();
    await page.getByText("Bulk receipts").first().click();
    await page.getByText("Full attention needed").first().waitFor({ timeout: 10000 });
    await page.locator('input[type="file"]').first().setInputFiles(`${dir}/receipt-no-date.png`);
    const dl = page.getByRole("button", { name: /download and read/i });
    if (await dl.isVisible().catch(() => false)) await dl.click();
    await page.getByText(/\d+ added to your review queue/i).waitFor({ timeout: 120000 });
  });
  await shot("04-bulk-done");

  // 4) Review shows what to check, and asks for the date before approving.
  await step("review", async () => { await page.getByRole("button", { name: /^review$/i }).click(); await page.getByText(/Worth a second look/).first().waitFor({ timeout: 10000 }); });
  await shot("05-review-flags");
  console.log("REVIEW TEXT", (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 1500));
  await step("review-fill", async () => {
    await page.getByRole("button", { name: /fill in what's missing/i }).first().click();
    await page.locator('input[type="date"]').first().fill("2026-10-28");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(800);
  });
  await shot("06-review-after-fill");
  console.log("AI CALLS", calls);
} catch (e) {
  console.log("STOPPED", String(e).slice(0, 200));
} finally {
  console.log(errors.slice(0, 15).join("\n") || "no page errors");
  await browser.close();
}
