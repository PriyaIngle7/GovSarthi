const puppeteer = require('puppeteer');
const express = require('express');

const app = express();
app.use(express.json());

// Helper function to clean and format search queries
const constructSearchQuery = (category, user) => {
  if (!category && !user?.profession && !user?.state && !user?.income) {
    return null;
  }

  const parts = [];
  
  if (category) parts.push(`schemes related to ${category.toLowerCase()}`);
  if (user?.profession) parts.push(`for ${user.profession.toLowerCase()} professionals`);
  if (user?.state) parts.push(`in ${user.state}`);
  if (user?.income) parts.push(`with income under ${user.income}`);

  // Create natural language query
  let query = parts.join(' ');
  
  // Capitalize first letter
  query = query.charAt(0).toUpperCase() + query.slice(1);
  
  // Remove any double spaces
  return query.replace(/\s+/g, ' ').trim();
};

app.post('/get-schemes', async (req, res) => {
  const { category, user } = req.body;

  // Validate input
  if (!category && !user?.profession && !user?.state && !user?.income) {
    return res.status(400).json({ 
      error: 'At least one search parameter is required (category, profession, state, or income)' 
    });
  }

  const searchText = constructSearchQuery(category, user);
  console.log('🔍 Constructed search query:', searchText);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // Set viewport and user agent for better compatibility
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    await page.goto('https://www.myscheme.gov.in/search', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for search input to be ready
    const inputSelector = 'input[placeholder="Search"]';
    await page.waitForSelector(inputSelector, { timeout: 20000 });

    // Clear any existing text and type our query
    await page.focus(inputSelector);
    await page.evaluate(selector => {
      document.querySelector(selector).value = '';
    }, inputSelector);
    
    await page.type(inputSelector, searchText, { delay: 100 });

    // Simulate more natural typing behavior
    await new Promise(resolve => setTimeout(resolve, 500));

    // Trigger search - try multiple approaches
    try {
      // First try pressing Enter
      await page.keyboard.press('Enter');
      console.log('✅ Triggered search with Enter key');
    } catch (e) {
      console.log('⚠️ Enter key failed, trying button click');
      // If Enter fails, click the search button
      const buttonSelector = 'button[aria-label="Search"]';
      await page.waitForSelector(buttonSelector, { timeout: 5000 });
      await page.click(buttonSelector);
    }

    // Wait for results with flexible timeout
    await page.waitForSelector('div.rounded-xl.shadow-md.bg-white', { 
      timeout: 30000 
    }).catch(e => {
      console.log('No results found within timeout');
      return [];
    });

    // Extract scheme information
    const schemes = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('div.rounded-xl.shadow-md.bg-white');

      cards.forEach(card => {
        const titleElem = card.querySelector('h5, h4, h3');
        const descElem = card.querySelector('p');
        const linkElem = card.querySelector('a[href]');
        
        results.push({
          name: titleElem?.innerText?.trim() || 'No title',
          benefit: descElem?.innerText?.trim() || 'No description',
          url: linkElem?.href || '',
          lastUpdated: new Date().toISOString().split('T')[0] // Add current date as metadata
        });
      });

      return results;
    });

    if (schemes.length === 0) {
      console.log('No schemes found, trying alternative search approach');
      return res.status(404).json({ 
        message: 'No schemes found matching your criteria',
        suggestion: 'Try broadening your search parameters' 
      });
    }

    res.json({ 
      count: schemes.length,
      query: searchText,
      results: schemes 
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    
    // Save screenshot with timestamp for debugging
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: `error-${timestamp}.png` });

    res.status(500).json({
      error: 'Failed to fetch schemes',
      details: err.message,
      suggestion: 'Please try again with different parameters'
    });

  } finally {
    await browser.close();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(3000, () => {
  console.log('✅ Agent running at http://localhost:3000');
});