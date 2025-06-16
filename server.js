const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const {
    from = 'Prishtina (PRN)',
    to = 'Dortmund (DTM)',
    departureDate = '18.06.2025',
    returnDate = '25.06.2025'
  } = req.body;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.goto('https://prishtinaticket.net', { waitUntil: 'domcontentloaded' });
    await page.select('select[name="VON"]', 'PRN');
    await page.select('select[name="NACH"]', 'DTM');
    await page.$eval('input[name="DATUM_HIN"]', (el, value) => el.value = value, departureDate);
    await page.$eval('input[name="DATUM_RUK"]', (el, value) => el.value = value, returnDate);
    await page.click('#buchen_aktion');
    await page.waitForSelector('#div_hin > table', { timeout: 15000 });
    await page.waitForSelector('#div_ruk > table', { timeout: 15000 });

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
          if (dateCol.includes(formattedDate)) return priceCol;
        }
        return '❌ Not found';
      };
      return {
        departurePrice: findPrice('#div_hin > table', departureDate),
        returnPrice: findPrice('#div_ruk > table', returnDate)
      };
    }, departureDate, returnDate);

    await browser.close();
    res.json({ from, to, departureDate, returnDate, ...prices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('✅ Puppeteer API is Live');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
