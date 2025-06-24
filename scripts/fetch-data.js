const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { diffLines } = require('diff');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const isSyncMode = process.argv[2] === '--sync';

const TARGETS = [
  {
    type: 'element-scrape',
    name: 'Silksong Steam Update',
    pageUrl: 'https://steamdb.info/app/1030300/history/',
    selector: 'xpath/.//td[text()="Last Record Update"]/following-sibling::td',
  },
  {
    type: 'element-scrape',
    name: 'Kickstarter Login',
    pageUrl: 'https://www.kickstarter.com/projects/11662585/hollow-knight/creator',
    selector: '#react-creator-tab',
  },
  {
    type: 'puppeteer',
    name: 'Nintendo JP',
    pageUrl: 'https://store-jp.nintendo.com/item/software/D70010000096731',
    apiUrl: 'https://store-jp.nintendo.com/mobify/proxy/api/product/shopper-products/v1/',
  },
  {
    type: 'multi-element-scrape',
    name: 'Silksong Nintendo US Store (Multi)',
    pageUrl: 'https://www.nintendo.com/us/store/products/hollow-knight-silksong-switch/',
    selectors: [
      {
        key: 'topSegment',
        selector: '.sc-1i9d4nw-0',
      },
      {
        key: 'middleSegment',
        selector: '.sc-4l5ex7-0',
      },
      {
        key: 'aboutThisItem',
        selector: '.sc-1bfhtts-0.ierIgL',
      }
    ],
  },
  {
  type: 'element-scrape',
  name: 'Nintendo UK Store',
  pageUrl: 'https://www.nintendo.com/en-gb/Games/Nintendo-Switch-download-software/Hollow-Knight-Silksong-1575920.html',
  selector: 'div[role="main"]',
  },

  {
    type: 'axios',
    name: 'Silksong Microsoft API',
    url: 'https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9N116V0599HB&market=US&languages=en-us',
  },
  {
  type: 'element-scrape',
  name: 'Playstation Store US',
  pageUrl: 'https://store.playstation.com/en-us/concept/10005908',
  selector: '#main',
  },
  {
    type: 'multi-element-scrape',
    name: 'GOG Store',
    pageUrl: 'https://www.gog.com/en/game/hollow_knight_silksong',
    selectors: [
      {
        key: 'mainColumn',
        selector: '.layout-main-col',
      },
      {
        key: 'sideColumn',
        selector: '.layout-side-col',
      },
      {
        key: 'images',
        selector: '.productcard-thumbnails-slider',
      }
    ],
  },
  {
    type: 'multi-element-scrape',
    name: 'Humble Store',
    pageUrl: 'https://www.humblebundle.com/store/hollow-knight-silksong',
    selectors: [
      {
        key: 'showcaseRow',
        selector: '.row-view.gray-row.showcase-row',
      },
      {
        key: 'detailsRow',
        selector: '.row-view.dark-gray-row.details-row',
      },
      {
        key: 'descriptionRow',
        selector: '.row-view.light-row.description-row',
      }
    ],
  },
  {
    type: 'element-scrape',
    name: 'Team Cherry Blog',
    pageUrl: 'https://www.teamcherry.com.au/',
    selector: '.blog-alternating-side-by-side-wrapper',
  },
];

const STATE_FILE_PATH = path.join(__dirname, '..', 'state.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '..', 'public', 'data.json');
const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

function readState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const fileContent = fs.readFileSync(STATE_FILE_PATH);
      return JSON.parse(fileContent);
    }
  } catch (error) {
    console.error('Error reading state file, starting fresh.', error);
  }
  return {};
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
}

async function scrapeWithPuppeteer(pageUrl, apiUrl) {
  console.log(`[Puppeteer] Launching STEALTH browser for API interception: ${pageUrl}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const apiResponsePromise = new Promise((resolve, reject) => {
    page.on('response', async (response) => {
      if (response.url().startsWith(apiUrl)) {
        console.log(`[Puppeteer] Intercepted target API call: ${response.url()}`);
        try {
          const jsonData = await response.json();
          resolve(jsonData); 
        } catch (e) {
          reject(new Error('Failed to parse JSON from API response.'));
        }
      }
    });
    setTimeout(() => { reject(new Error('Puppeteer API interception timed out after 90 seconds.')); }, 90000);
  });

  try {
    console.log(`[Puppeteer] Navigating to page...`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[Puppeteer] Waiting for API response to be captured...');
    const capturedData = await apiResponsePromise;
    await browser.close();
    console.log('[Puppeteer] Browser closed. API data captured.');
    return capturedData;
  } catch (error) {
    await browser.close();
    console.error(`[Puppeteer] An error occurred during API interception: ${error.message}`);
    return null; 
  }
}

async function scrapeElementText(pageUrl, selector) {
  console.log(`[Puppeteer] Launching STEALTH browser for element scrape: ${pageUrl}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  try {
    console.log(`[Puppeteer] Navigating to page...`);
    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log(`[Puppeteer] Waiting for selector: ${selector}`);
    await page.waitForSelector(selector, { timeout: 30000 });
    const elementText = await page.$eval(selector, (el) => el.textContent.trim());
    await browser.close();
    console.log('[Puppeteer] Browser closed. Text scraped successfully.');
    return elementText;
  } catch (error) {
    await page.screenshot({ path: 'debug-scrape-failure.png', fullPage: true });
    await browser.close();
    console.error(`[Puppeteer] Failed to scrape element: ${error.message}`);
    return null;
  }
}

async function scrapeDataAttribute(pageUrl, selector, attributeName) {
  console.log(`[Puppeteer] Launching STEALTH browser for data attribute scrape: ${pageUrl}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  try {
    console.log(`[Puppeteer] Navigating to page...`);
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });

    console.log(`[Puppeteer] Waiting for selector: ${selector}`);
    await page.waitForSelector(selector);

    const attributeValue = await page.$eval(selector, (el, attr) => el.getAttribute(attr), attributeName);
    
    await browser.close();
    
    if (!attributeValue) {
      throw new Error(`Attribute "${attributeName}" not found on element with selector "${selector}"`);
    }
    
    console.log('[Puppeteer] Browser closed. Data attribute scraped.');
    return JSON.parse(attributeValue);

  } catch (error) {
    await browser.close();
    console.error(`[Puppeteer] Failed to scrape data attribute: ${error.message}`);
    return null;
  }
}

async function scrapeMultipleElements(pageUrl, selectors) {
  console.log(`[Puppeteer] Launching STEALTH browser for multi-element scrape: ${pageUrl}`);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  try {
    console.log(`[Puppeteer] Navigating to page...`);
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });

    const scrapedData = {};

    for (const { key, selector } of selectors) {
      console.log(`[Puppeteer] Waiting for selector for key "${key}": ${selector}`);
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        const elementText = await page.$eval(selector, (el) => el.textContent.trim());
        scrapedData[key] = elementText;
      } catch (e) {
        console.warn(`[Puppeteer] Could not find element for key "${key}". It will be missing from the data.`);
        scrapedData[key] = null;
      }
    }

    await browser.close();
    console.log('[Puppeteer] Browser closed. Multi-element scrape complete.');
    
    return scrapedData;

  } catch (error) {
    await page.screenshot({ path: 'debug-multi-scrape-failure.png', fullPage: true });
    await browser.close();
    console.error(`[Puppeteer] Failed to scrape multiple elements: ${error.message}`);
    return null;
  }
}

async function fetchAllData() {
  if (isSyncMode) {
    console.log('--- Running in SYNC mode. Baselining all sources to their current state. ---');
    console.log('--- No change notifications will be generated for this run. ---');
  } else {
    console.log('--- Starting data fetch cycle in NORMAL mode. ---');
  }
  
  const currentState = readState();
  const newPublicData = { lastChecked: new Date().toISOString(), results: [] };
  const newState = {};

  for (const target of TARGETS) {
    console.log(`\nFetching: ${target.name}`);
    let newData = null;

    try {
      if (target.type === 'puppeteer') {
        newData = await scrapeWithPuppeteer(target.pageUrl, target.apiUrl);
      } else if (target.type === 'axios') {
        const response = await axios.get(target.url);
        newData = response.data;
      } else if (target.type === 'element-scrape') {
        const text = await scrapeElementText(target.pageUrl, target.selector);
        newData = text ? { lastUpdate: text } : null;
      } else if (target.type === 'data-attribute-scrape') {
        newData = await scrapeDataAttribute(target.pageUrl, target.selector, target.attributeName);
      } else if (target.type === 'multi-element-scrape') {
        newData = await scrapeMultipleElements(target.pageUrl, target.selectors);
      }
      
      if (!newData) {
        throw new Error('No data was returned from fetch.');
      }
    } catch (error) {
      console.error(`Failed to fetch data for "${target.name}":`, error.message);
      newState[target.name] = currentState[target.name];
      newPublicData.results.push({ name: target.name, success: false, error: error.message });
      continue;
    }

    if (isSyncMode) {
      console.log(`[Sync] Baselining ${target.name}.`);
      
      newPublicData.results.push({
        name: target.name,
        success: true,
        isUpdated: false,
        lastChangeTimestamp: null,
        diff: null,
        data: newData,
      });

      newState[target.name] = {
        lastChangeTimestamp: null,
        data: newData,
      };

    } else {
      const previousState = currentState[target.name] || {};
      let lastChangeTimestamp = previousState.lastChangeTimestamp || null;
      let diffResult = null;

      const oldDataString = previousState.data ? JSON.stringify(previousState.data, null, 2) : "";
      const newDataString = JSON.stringify(newData, null, 2);

      if (oldDataString !== newDataString) {
        console.log(`>>> CHANGE DETECTED for ${target.name}`);
        lastChangeTimestamp = new Date().toISOString();
        diffResult = diffLines(oldDataString, newDataString);
      } else {
        console.log(`No change for ${target.name}`);
      }

      const isUpdated = lastChangeTimestamp 
        ? (new Date() - new Date(lastChangeTimestamp)) < TWENTY_FOUR_HOURS_IN_MS
        : false;

      newPublicData.results.push({
        name: target.name,
        success: true,
        isUpdated: isUpdated,
        lastChangeTimestamp: lastChangeTimestamp,
        diff: diffResult,
        data: newData,
      });

      newState[target.name] = {
        lastChangeTimestamp: lastChangeTimestamp,
        data: newData,
      };
    }
  }
  
  writeState(newState);
  fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(newPublicData, null, 2));

  console.log('\n--- Cycle complete. State and public files updated. ---');
}

fetchAllData()
  .catch((error) => {
    console.error('A critical unhandled error occurred in the script:', error);
    process.exit(1);
  });