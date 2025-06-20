const express = require("express");
const puppeteer = require("puppeteer-core");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { from, to, departureDate, returnDate } = req.body;

  if (!from || !to || !departureDate || !returnDate) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=YOUR_BROWSERLESS_TOKEN`
    });

    const page = await browser.newPage();
    await page.goto("https://prishtinaticket.net", { waitUntil: "domcontentloaded" });
    await new Promise(r => setTimeout(r, 3000));

    // Set FROM
    await page.waitForSelector('select[name="VON"]');
    await page.select('select[name="VON"]', from);

    // Set TO
    await page.waitForSelector('select[name="NACH"]');
    await page.select('select[name="NACH"]', to);

    // Set Departure Date
    await page.waitForSelector('input[name="DATUM_HIN"]');
    await page.$eval('input[name="DATUM_HIN"]', (el, val) => el.value = val, departureDate);

    // Set Return Date
    await page.waitForSelector('input[name="DATUM_RUK"]');
    await page.$eval('input[name="DATUM_RUK"]', (el, val) => el.value = val, returnDate);

    // Click Search
    await page.click("#buchen_aktion");
    await new Promise(r => setTimeout(r, 3000));

    await page.waitForSelector('#div_hin > table');
    await page.waitForSelector('#div_ruk > table');

    const prices = await page.evaluate((departureDate, returnDate) => {
      const getFormattedDate = (d) => d.slice(0, 5); // "18.06.2025" → "18.06"

      const findPrice = (selector, targetDate) => {
        const table = document.querySelector(selector);
        if (!table) return null;

        const rows = Array.from(table.querySelectorAll('tr'));

        for (let row of rows) {
          const cols = row.querySelectorAll('td');
          if (cols.length < 5) continue;

          const dateCol = cols[1].innerText.trim();   // e.g. 'MËR 18.06'
          const priceCol = cols[4].innerText.trim();  // e.g. '100 €'

          if (dateCol.includes(getFormattedDate(targetDate))) {
            return priceCol;
          }
        }

        return null;
      };

      return {
        departurePrice: findPrice('#div_hin > table', departureDate),
        returnPrice: findPrice('#div_ruk > table', returnDate)
      };
    }, departureDate, returnDate);

    await browser.close();

    res.json({
      from,
      to,
      departureDate,
      returnDate,
      departurePrice: prices.departurePrice || "Not found",
      returnPrice: prices.returnPrice || "Not found"
    });

  } catch (error) {
    console.error("Scraping error:", error.message);
    res.status(500).json({ error: "Scraping failed." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
