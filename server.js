import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // <-- IMPORTANT to parse incoming JSON

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
    await new Promise(resolve => setTimeout(resolve, 3000));

    // --- Select fields and enter values ---
    await page.select('select[name="VON"]', from);
    await page.select('select[name="NACH"]', to);
    await page.$eval('input[name="DATUM_HIN"]', (el, value) => el.value = value, departureDate);
    await page.$eval('input[name="DATUM_RUK"]', (el, value) => el.value = value, returnDate);
    await page.click('#buchen_aktion');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // --- Extract prices from tables ---
    const prices = await page.evaluate((departureDate, returnDate) => {
      const getFormattedDate = (d) => d.slice(0, 5);

      const findPrice = (selector, targetDate) => {
        const table = document.querySelector(selector);
        if (!table) return '❌ Table not found';

        const formattedDate = getFormattedDate(targetDate);
        const rows = Array.from(table.querySelectorAll('tr'));

        for (let row of rows) {
          const cols = row.querySelectorAll('td');
          if (cols.length < 5) continue;
          const dateCol = cols[1].innerText.trim();
          const priceCol = cols[4].innerText.trim();
          if (dateCol.includes(formattedDate)) {
            return priceCol;
          }
        }

        return '❌ Not found';
      };

      return {
        departurePrice: findPrice('#div_hin > table', departureDate),
        returnPrice: findPrice('#div_ruk > table', returnDate)
      };
    }, departureDate, returnDate);

    await browser.close();
    res.json(prices);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scraping failed", details: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("✈️ Flight scraper is running!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
