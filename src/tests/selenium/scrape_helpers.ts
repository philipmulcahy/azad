import { By, until, WebDriver } from 'selenium-webdriver';
import { SeleniumContext } from './driver';

export async function setupAndClearCache(driver: WebDriver, ctx: SeleniumContext): Promise<void> {
  const site = process.env.AMAZON_SITE || 'amazon.com';
  const orderHistoryUrl = `https://www.${site}/gp/css/order-history`;

  console.log(`Navigating to Amazon Order History: ${orderHistoryUrl}`);
  await driver.get(orderHistoryUrl);

  // Dynamic login helper: If sign-in is required, wait for user to complete it
  const currentUrl = await driver.getCurrentUrl();
  if (currentUrl.includes('signin') || currentUrl.includes('/ap/')) {
    console.log('============================================================');
    console.log('WARNING: Amazon sign-in required.');
    console.log('Please log in manually in the opened Chrome browser window.');
    console.log('The test will resume automatically once sign-in completes.');
    console.log('============================================================');

    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes('order-history') || url.includes('/order-history/');
    }, 300000); // Wait up to 5 minutes for manual sign-in
    
    console.log('Sign-in detected. Continuing test...');
  }

  // Ensure we are on the order history page and it's loaded
  await driver.wait(until.elementLocated(By.tagName('body')), 20000);

  // 1. Clear Cache Step
  console.log('Switching to Popup tab...');
  await driver.switchTo().window(ctx.popupTab);

  console.log('Clicking clear cache button...');
  const clearCacheBtn = await driver.wait(
    until.elementLocated(By.id('azad_clear_cache')),
    10000
  );
  await clearCacheBtn.click();

  // 2. Switch back to Amazon tab to verify notification
  console.log('Switching to Amazon tab to verify notification...');
  await driver.switchTo().window(ctx.amazonTab);

  // The notification container is injected at the top of body
  console.log('Waiting for "Cache cleared" notification...');
  await driver.wait(
    until.elementLocated(By.id('azad_notification_bar_container')),
    15000
  );
  const notification = await driver.wait(
    until.elementLocated(By.className('azad_notification_bar')),
    15000
  );
  const text = await notification.getText();
  expect(text).toContain('Cache cleared');
  console.log('Ephemeral notification "Cache cleared" verified successfully!');

  // 3. Refresh Amazon tab to re-run the content script and naturally discover available years
  console.log('Refreshing Amazon tab to re-populate YearsCache...');
  await driver.navigate().refresh();
  await driver.sleep(2000); // Give it a moment to run advertisePeriods()
}
