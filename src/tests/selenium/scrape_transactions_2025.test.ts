import { initDriver, SeleniumContext } from './driver';
import { setupAndClearCache } from './scrape_helpers';
import { By, until, WebDriver } from 'selenium-webdriver';

describe('Amazon Order History Reporter E2E Transaction Scrape', () => {
  let ctx: SeleniumContext;
  let driver: WebDriver;

  beforeAll(async () => {
    ctx = await initDriver();
    driver = ctx.driver;
  }, 30000);

  afterAll(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  test('should clear cache and scrape 2025 transactions successfully', async () => {
    const targetYear = process.env.SCRAPE_YEAR || '2025';

    await setupAndClearCache(driver, ctx);

    console.log('Switching back to Popup tab to start transaction scrape...');
    await driver.switchTo().window(ctx.popupTab);

    // 1. Select the "Transactions" radio button
    console.log('Selecting "Transactions" table type...');
    const transactionRadioBtn = await driver.wait(
      until.elementLocated(By.id('azad_show_transactions')),
      10000
    );
    await transactionRadioBtn.click();

    // 2. Click the year button
    console.log(`Waiting for and clicking year button "${targetYear}"...`);
    await driver.wait(async () => {
      try {
        const yearButton = await driver.findElement(
          By.css(`.azad_year_button[value="${targetYear}"]`)
        );
        if (yearButton) {
          await yearButton.click();
          return true;
        }
        return false;
      } catch (err) {
        if (err instanceof Error) {
          if (
            err.name === 'StaleElementReferenceError' ||
            err.name === 'NoSuchElementError'
          ) {
            return false; // Retry in next iteration
          }
        }
        throw err;
      }
    }, 30000, `Timed out waiting/clicking year button "${targetYear}".`);

    // 3. Switch to Amazon tab and wait for table to render
    console.log('Switching to Amazon tab to monitor scraping...');
    await driver.switchTo().window(ctx.amazonTab);

    console.log('Waiting for scraping to complete (waiting for Datatables info element)...');
    await driver.wait(
      until.elementLocated(By.id('azad_order_table_info')),
      240000 // Up to 4 minutes for scraping and processing to finish
    );
    const orderTable = await driver.findElement(By.id('azad_order_table'));

    // 4. Mapped Column Headers dynamically
    const headers = await orderTable.findElements(By.css('thead th'));
    const colIndexes: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      const text = (await headers[i].getText()).toLowerCase().trim();
      colIndexes[text] = i;
    }
    console.log('Mapped columns:', colIndexes);

    // Ensure we have essential transaction columns mapped
    expect(colIndexes['date']).toBeDefined();
    expect(colIndexes['order ids']).toBeDefined();
    expect(colIndexes['amount']).toBeDefined();
    expect(colIndexes['card_details']).toBeDefined();

    // 5. Try to switch Page Length to "All" (value "-1") to draw all rows in the DOM
    try {
      console.log('Attempting to change Datatables page length to "All"...');
      const selectElement = await driver.findElement(
        By.css('#azad_order_table_length select, .dataTables_length select, .dt-length select')
      );
      await selectElement.sendKeys('All');
    } catch (e) {
      console.warn('Could not select "All" from length dropdown, verifying first page of transactions only:', (e as Error).message);
    }

    // 6. Parse total count from the DataTable info element
    const infoText = await driver.findElement(
      By.css('#azad_order_table_info, .dataTables_info, .dt-info')
    ).getText();
    console.log('Datatable info text:', infoText);
    const match = infoText.match(/of\s+([\d,]+)\s+entries/i);
    expect(match).toBeTruthy();
    const totalCount = parseInt(match![1].replace(/,/g, ''), 10);
    console.log(`Parsed total scraped transactions count: ${totalCount}`);
    expect(totalCount).toBeGreaterThan(0);

    // 7. Retrieve all table rows and validate their contents
    const rows = await orderTable.findElements(By.css('tbody tr'));
    console.log(`Scraping finished. Found ${rows.length} rows in the transaction table DOM.`);
    expect(rows.length).toBe(totalCount);

    // Helper to parse price string to float
    const parsePrice = (val: string): number => {
      const cleaned = val.replace(/[^\d.-]/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    let validDateCount = 0;
    let yearTargetCount = 0;
    let validAmountCount = 0;
    let validOrderIdsCount = 0;
    let validCardDetailsCount = 0;
    let expectedAmountSum = 0;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const orderIdRegex = /[A-Z0-9]{3}-\d{7}-\d{7}/i;

    for (let i = 0; i < rows.length; i++) {
      const cells = await rows[i].findElements(By.css('td'));
      if (cells.length === 0) continue;

      // Validate Date
      const date = (await cells[colIndexes['date']].getText()).trim();
      if (dateRegex.test(date)) {
        validDateCount++;
        if (date.startsWith(targetYear)) {
          yearTargetCount++;
        } else {
          console.warn(`Row ${i} has date not matching target year ${targetYear}: "${date}"`);
        }
      } else {
        console.warn(`Row ${i} has invalid Date format: "${date}"`);
      }

      // Validate Order IDs (should contain at least one order ID pattern or not be empty)
      const orderIdsText = (await cells[colIndexes['order ids']].getText()).trim();
      if (orderIdsText !== '') {
        validOrderIdsCount++;
        if (!orderIdRegex.test(orderIdsText)) {
          console.warn(`Row ${i} has order ids without expected format: "${orderIdsText}"`);
        }
      }

      // Validate Amount
      const amountText = (await cells[colIndexes['amount']].getText()).trim();
      if (amountText !== '' && amountText !== '?' && amountText !== 'N/A') {
        validAmountCount++;
        expectedAmountSum += parsePrice(amountText);
      }

      // Validate Card Details
      const cardDetailsText = (await cells[colIndexes['card_details']].getText()).trim();
      if (cardDetailsText !== '') {
        validCardDetailsCount++;
      }
    }

    console.log(`Validation Stats:`);
    console.log(`  - Total Rows: ${rows.length}`);
    console.log(`  - Valid Dates: ${validDateCount}`);
    console.log(`  - Target Year (${targetYear}) Dates: ${yearTargetCount}`);
    console.log(`  - Valid Order IDs: ${validOrderIdsCount}`);
    console.log(`  - Valid Amounts: ${validAmountCount}`);
    console.log(`  - Valid Card Details: ${validCardDetailsCount}`);

    expect(validDateCount).toBe(rows.length);
    expect(yearTargetCount).toBe(rows.length);
    
    const minimumExpectedFields = Math.floor(rows.length * 0.9);
    expect(validAmountCount).toBeGreaterThanOrEqual(minimumExpectedFields);
    expect(validOrderIdsCount).toBeGreaterThanOrEqual(minimumExpectedFields);

    // 8. Verify footer "all=" totals for amount
    console.log('Verifying footer "all=" totals...');
    const footerCells = await orderTable.findElements(By.css('tfoot th, tfoot td'));
    const amountIdx = colIndexes['amount'];
    
    if (amountIdx !== undefined && amountIdx < footerCells.length) {
      const footerText = await footerCells[amountIdx].getText();
      console.log(`Footer for "amount": "${footerText}"`);
      
      const allMatch = footerText.match(/all=([\d.-]+)/);
      if (allMatch) {
        const actualAllSum = parseFloat(allMatch[1]);
        console.log(`  - Expected Sum: ${expectedAmountSum.toFixed(2)}, Actual Sum: ${actualAllSum.toFixed(2)}`);
        
        // Verify equality within a small tolerance margin
        expect(Math.abs(actualAllSum - expectedAmountSum)).toBeLessThan(0.02);
      }
    }
  }, 240000); // 4 minutes total timeout for this test
});
