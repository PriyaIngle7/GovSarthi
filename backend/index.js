const puppeteer = require('puppeteer');
const express = require('express');

const app = express();
app.use(express.json());

app.post('/get-schemes', async (req, res) => {
  const { category, user } = req.body;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://www.myscheme.gov.in/search', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    const inputSelector = 'input[placeholder="Search"]';
    await page.waitForSelector(inputSelector, { timeout: 20000 });

    const searchText = `${category} ${user.profession} ${user.state} income ${user.income}`;
    console.log('🔍 Typing search:', searchText);

    await page.focus(inputSelector);
    await page.type(inputSelector, searchText, { delay: 100 });

    // Fire input events manually to trigger JS-based button enabling
    await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      if (input) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
      }
    }, inputSelector);

    // Wait for the button to become enabled
    const buttonSelector = 'button[aria-label="Search"]';
    await page.waitForFunction((sel) => {
      const btn = document.querySelector(sel);
      return btn && !btn.disabled;
    }, { timeout: 5000 }, buttonSelector);

    // Click the now-enabled button
    await page.click(buttonSelector);
    console.log('✅ Search button clicked');

    // Wait for cards to load
    await page.waitForSelector('div.rounded-xl.shadow-md.bg-white', { timeout: 20000 });

    const schemes = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('div.rounded-xl.shadow-md.bg-white');

      cards.forEach(card => {
        const title = card.querySelector('h5')?.innerText || '';
        const description = card.querySelector('p')?.innerText || '';
        const url = card.querySelector('a')?.href || '';
        results.push({ name: title, benefit: description, url });
      });

      return results;
    });

    res.json({ results: schemes });

  } catch (err) {
    console.error('❌ Error:', err.message);
    await page.screenshot({ path: 'scraping-error.png' });

    res.status(500).json({
      error: 'Something went wrong',
      details: err.message,
    });

  } finally {
    await browser.close();
  }
});

app.listen(3000, () => {
  console.log('✅ Agent running at http://localhost:3000');
});
