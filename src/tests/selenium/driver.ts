import { Builder, WebDriver, By, until } from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome';
import * as path from 'path';
import * as fs from 'fs';

export interface SeleniumContext {
  driver: WebDriver;
  extensionId: string;
  amazonTab: string;
  popupTab: string;
}

export async function initDriver(): Promise<SeleniumContext> {
  let userDataDir = process.env.CHROME_USER_DATA_DIR;
  let profileDir = process.env.CHROME_PROFILE_DIR || 'Default';
  let site = process.env.AMAZON_SITE || 'amazon.co.uk';
  let scrapeYear = process.env.SCRAPE_YEAR || '2025';

  // Try to load local config file
  const configPath = path.resolve(__dirname, '../../../selenium.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.chromeUserDataDir) userDataDir = config.chromeUserDataDir;
      if (config.chromeProfileDir) profileDir = config.chromeProfileDir;
      if (config.amazonSite) site = config.amazonSite;
      if (config.scrapeYear) scrapeYear = config.scrapeYear.toString();
      console.log('Loaded Selenium configuration from selenium.config.json');
    } catch (e) {
      console.warn('Failed to parse selenium.config.json:', e);
    }
  }

  // Set env vars so the tests can access them easily
  process.env.AMAZON_SITE = site;
  process.env.SCRAPE_YEAR = scrapeYear;

  const orderHistoryUrl = `https://www.${site}/gp/css/order-history`;
  const options = new chrome.Options();
  
  // Path to build directory of extension
  const extensionPath = path.resolve(__dirname, '../../../build');
  options.addArguments(`--load-extension=${extensionPath}`);

  if (userDataDir) {
    console.log(`Using Chrome user data directory: ${userDataDir}, profile: ${profileDir}`);
    options.addArguments(`--user-data-dir=${userDataDir}`);
    options.addArguments(`--profile-directory=${profileDir}`);
  } else {
    console.warn('CHROME_USER_DATA_DIR not set. Selenium will start with a fresh temporary Chrome profile.');
  }

  options.addArguments('--disable-gpu');

  // Configure ChromeDriver to output verbose logs to a file in the workspace root
  const logPath = path.resolve(__dirname, '../../../chromedriver.log');
  const service = new chrome.ServiceBuilder()
    .loggingTo(logPath)
    .enableVerboseLogging();
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();

  let extensionId = '';
  let amazonTab = '';
  try {
    console.log(`Initial navigation to retrieve extension ID from content script: ${orderHistoryUrl}`);
    await driver.get(orderHistoryUrl);
    amazonTab = await driver.getWindowHandle();

    // Position and maximize the main Amazon window so it remains visible
    await driver.manage().window().setRect({ x: 0, y: 0 });
    await driver.manage().window().maximize();

    // Wait for the content script to inject the extension ID attribute on the HTML element
    const htmlElement = await driver.wait(
      until.elementLocated(By.tagName('html')),
      15000
    );

    // Wait up to 10 seconds for the attribute to be populated by the content script
    await driver.wait(async () => {
      extensionId = (await htmlElement.getAttribute('data-azad-extension-id')) || '';
      return extensionId !== '';
    }, 10000, 'Timed out waiting for extension ID from content script. Ensure the extension is built (npm run build) and loaded.');

    console.log(`Successfully retrieved Extension ID: ${extensionId}`);
  } catch (err) {
    await driver.quit();
    throw err;
  }

  // Open the popup in a new WINDOW instead of a new tab
  console.log('Opening extension popup in a new separate window...');
  await driver.switchTo().newWindow('window');
  const popupTab = await driver.getWindowHandle();
  await driver.get(`chrome-extension://${extensionId}/popup.html`);

  // Resize and position the popup window to look like the extension popup on the right side
  await driver.manage().window().setRect({ width: 450, height: 700, x: 1000, y: 100 });

  // Switch back to the original Amazon window initially so it is in the foreground
  console.log('Switching focus back to Amazon window...');
  await driver.switchTo().window(amazonTab);

  return {
    driver,
    extensionId,
    amazonTab,
    popupTab
  };
}
