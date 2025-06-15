const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');

const LOGIN_EMAIL = 'Olt.mexhuani@gmail.com';
const LOGIN_PASSWORD = 'Oltimex.1';
const START_URL = 'https://www.kijiji.ca/b-apartments-condos/barrie/c37l1700006?for-rent-by=ownr&view=list';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🔐 Navigating to login...");
  await page.goto('https://id.kijiji.ca/login?service=https%3A%2F%2Fid.kijiji.ca%2Foauth2.0%2FcallbackAuthorize%3Fclient_id%3Dkijiji_horizontal_web_gpmPihV3%26redirect_uri%3Dhttps%253A%252F%252Fwww.kijiji.ca%252Fapi%252Fauth%252Fcallback%252Fcis%26response_type%3Dcode%26client_name%3DCasOAuthClient&locale=en', {
    waitUntil: 'domcontentloaded'
  });

  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', LOGIN_EMAIL);
  await page.fill('input[name="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  console.log("✅ Logged in successfully");

  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

  let results = [];
  let pageNum = 1;

  while (true) {
    console.log(`📄 Scraping page ${pageNum}...`);

    const links = await page.$$eval('a[data-testid="listing-link"]', els =>
      els.map(el => el.href).filter(href => href.includes('/v-'))
    );
    console.log(`🔍 Found ${links.length} listings`);

    if (links.length === 0) break;

    for (const link of links) {
      const listingPage = await context.newPage();
      await listingPage.goto(link, { waitUntil: 'domcontentloaded' });

      const title = await listingPage.title();
      let phone = 'Not found';

      try {
        const revealBtn = await listingPage.$('button:has-text("Reveal phone number")');
        if (revealBtn) {
          await revealBtn.click();
          await listingPage.waitForTimeout(1500);

          // Wait for a real phone number to appear as <a href="tel:+1-...">
          await listingPage.waitForSelector('a[href^="tel:+1-"]', { timeout: 5000 });

          // Extract phone number
          phone = await listingPage.$eval('a[href^="tel:+1-"]', el => el.textContent.trim());
        }
      } catch (err) {
        console.warn(`⚠️ Phone not revealed for ${link} — ${err.message}`);
      }

      results.push({ title, url: link, phone });
      console.log(`📌 ${title} — ${phone}`);
      await listingPage.close();
    }

    const nextButton = await page.$('a[title="Next"]');
    if (nextButton) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        nextButton.click()
      ]);
      pageNum++;
    } else {
      console.log("✅ No more pages.");
      break;
    }
  }

  if (results.length === 0) {
    console.warn("⚠️ No data scraped.");
  } else {
    const csv = parse(results);
    const filePath = path.join(__dirname, 'kijiji_results.csv');
    fs.writeFileSync(filePath, csv);
    console.log(`📥 Saved ${results.length} listings to ${filePath}`);
  }

  await browser.close();
})();
