import { initDriver, SeleniumContext } from './driver';
import { setupAndClearCache } from './scrape_helpers';
import { By, until, WebDriver } from 'selenium-webdriver';

describe('Amazon Order History Reporter E2E Orders Scrape', () => {
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

  test('should clear cache and scrape 2025 orders successfully', async () => {
    const targetYear = process.env.SCRAPE_YEAR || '2025';

    await setupAndClearCache(driver, ctx);

    // 3. Start Scraping Step
    console.log('Switching back to Popup tab to start scrape...');
    await driver.switchTo().window(ctx.popupTab);

    // Explicitly click the Orders radio button to ensure we don't accidentally scrape transactions from a previous test run
    console.log('Selecting "Orders" table type...');
    const ordersRadioBtn = await driver.wait(
      until.elementLocated(By.id('azad_show_orders')),
      10000
    );
    await ordersRadioBtn.click();

    // Wait for the year buttons to populate and click the target year button.
    // Handles potential StaleElementReferenceError if the popup re-renders the buttons.
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

    // 4. Switch to Amazon tab and wait for table to render
    console.log('Switching to Amazon tab to monitor scraping...');
    await driver.switchTo().window(ctx.amazonTab);

    console.log('Waiting for scraping to complete (waiting for Datatables info element)...');
    await driver.wait(
      until.elementLocated(By.id('azad_order_table_info')),
      240000 // Up to 4 minutes for scraping and processing to finish
    );
    const orderTable = await driver.findElement(By.id('azad_order_table'));

    // 5. Mapped Column Headers dynamically
    const headers = await orderTable.findElements(By.css('thead th'));
    const colIndexes: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      const text = (await headers[i].getText()).toLowerCase().trim();
      colIndexes[text] = i;
    }
    console.log('Mapped columns:', colIndexes);

    // Ensure we have essential columns mapped
    expect(colIndexes['order id']).toBeDefined();
    expect(colIndexes['date']).toBeDefined();
    expect(colIndexes['total']).toBeDefined();

    // 6. Try to switch Page Length to "All" (value "-1") to draw all rows in the DOM
    try {
      console.log('Attempting to change Datatables page length to "All"...');
      const selectElement = await driver.findElement(
        By.css('#azad_order_table_length select, .dataTables_length select, .dt-length select')
      );
      await selectElement.sendKeys('All');
    } catch (e) {
      console.warn('Could not select "All" from length dropdown, verifying first page of orders only:', (e as Error).message);
    }

    // 7. Parse total count from the DataTable info element
    const infoText = await driver.findElement(
      By.css('#azad_order_table_info, .dataTables_info, .dt-info')
    ).getText();
    console.log('Datatable info text:', infoText);
    const match = infoText.match(/of\s+([\d,]+)\s+entries/i);
    expect(match).toBeTruthy();
    const totalCount = parseInt(match![1].replace(/,/g, ''), 10);
    console.log(`Parsed total scraped orders count: ${totalCount}`);
    expect(totalCount).toBeGreaterThan(0);

    // 8. Retrieve all table rows and validate their contents
    const rows = await orderTable.findElements(By.css('tbody tr'));
    console.log(`Scraping finished. Found ${rows.length} rows in the order table DOM.`);
    expect(rows.length).toBe(totalCount);

    // Helper to parse price string (e.g., "£1.99") to float
    const parsePrice = (val: string): number => {
      const cleaned = val.replace(/[^\d.-]/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    // Tracks calculated column sums for the footer verification
    const numericCols = ['total', 'shipping', 'shipping_refund', 'gift', 'vat', 'refund'];
    const calculatedSums: Record<string, number> = {};
    numericCols.forEach(col => { calculatedSums[col] = 0; });

    let validOrderIdCount = 0;
    let validDateCount = 0;
    let yearTargetCount = 0;
    let validTotalCount = 0;
    
    // New validation counters
    let giftNonBlankCount = 0;
    let shippingNonBlankNonZeroCount = 0;
    let missingVatCount = 0;

    const orderIdRegex = /^[A-Z0-9]{3}-\d{7}-\d{7}$/i;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    for (let i = 0; i < rows.length; i++) {
      const cells = await rows[i].findElements(By.css('td'));
      if (cells.length === 0) continue;

      // Validate Order ID
      const orderId = (await cells[colIndexes['order id']].getText()).trim();
      if (orderIdRegex.test(orderId)) {
        validOrderIdCount++;
      } else {
        console.warn(`Row ${i} has invalid Order ID format: "${orderId}"`);
      }

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

      // Validate Total price (should not be empty, '?', or 'N/A')
      const totalText = (await cells[colIndexes['total']].getText()).trim();
      if (totalText !== '' && totalText !== '?' && totalText !== 'N/A') {
        validTotalCount++;
      }

      // 1. Gift checks
      if (colIndexes['gift'] !== undefined) {
        const giftText = (await cells[colIndexes['gift']].getText()).trim();
        if (giftText !== '' && giftText !== '?' && giftText !== 'N/A') {
          giftNonBlankCount++;
        }
      }

      // 2. Shipping checks
      if (colIndexes['shipping'] !== undefined) {
        const shippingText = (await cells[colIndexes['shipping']].getText()).trim();
        const shippingVal = parsePrice(shippingText);
        if (shippingText !== '' && shippingText !== '?' && shippingText !== 'N/A' && shippingVal > 0) {
          shippingNonBlankNonZeroCount++;
        }
      }

      // 3. VAT checks
      if (colIndexes['vat'] !== undefined) {
        const vatText = (await cells[colIndexes['vat']].getText()).trim();
        if (vatText === '' || vatText === '?' || vatText === 'N/A') {
          missingVatCount++;
        }
      }

      // Sum up all visible numeric columns for this row
      numericCols.forEach(col => {
        const idx = colIndexes[col];
        if (idx !== undefined) {
          cells[idx].getText().then(text => {
            calculatedSums[col] += parsePrice(text.trim());
          });
        }
      });
    }

    // Resolve any pending promise-based sums
    await driver.sleep(100);

    console.log(`Validation Stats:`);
    console.log(`  - Total Rows: ${rows.length}`);
    console.log(`  - Valid Order IDs: ${validOrderIdCount}`);
    console.log(`  - Valid Dates: ${validDateCount}`);
    console.log(`  - Target Year (${targetYear}) Dates: ${yearTargetCount}`);
    console.log(`  - Valid Totals: ${validTotalCount}`);
    console.log(`  - Non-blank Gifts: ${giftNonBlankCount}`);
    console.log(`  - Non-blank/Non-zero Shipping: ${shippingNonBlankNonZeroCount}`);
    console.log(`  - Missing VAT: ${missingVatCount}`);

    // Strict inequalities and assertions
    expect(validOrderIdCount).toBe(rows.length);
    expect(validDateCount).toBe(rows.length);
    expect(yearTargetCount).toBe(rows.length);
    
    // Expect at least 90% of the totals to be successfully scraped and populated
    const minimumExpectedTotals = Math.floor(rows.length * 0.9);
    expect(validTotalCount).toBeGreaterThanOrEqual(minimumExpectedTotals);

    // 9. Additional Inequality Validations
    console.log('Asserting additional statistical inequalities...');
    
    // 5 < gift count < 10
    expect(giftNonBlankCount).toBeGreaterThan(5);
    expect(giftNonBlankCount).toBeLessThan(10);

    // 10 < shipping count < 25
    expect(shippingNonBlankNonZeroCount).toBeGreaterThan(10);
    expect(shippingNonBlankNonZeroCount).toBeLessThan(25);

    // Fewer than 10% of orders are missing VAT values
    const maxAllowedMissingVat = Math.floor(rows.length * 0.1);
    expect(missingVatCount).toBeLessThan(maxAllowedMissingVat);

    // 10. Verify footer "all=" totals
    console.log('Verifying footer "all=" totals...');
    const footerCells = await orderTable.findElements(By.css('tfoot th, tfoot td'));
    for (const col of numericCols) {
      const idx = colIndexes[col];
      if (idx !== undefined && idx < footerCells.length) {
        const footerText = await footerCells[idx].getText();
        console.log(`Footer for "${col}": "${footerText}"`);
        
        // Regex matches "all=YY.YY"
        const allMatch = footerText.match(/all=([\d.-]+)/);
        if (allMatch) {
          const actualAllSum = parseFloat(allMatch[1]);
          const expectedAllSum = calculatedSums[col];
          console.log(`  - Expected Sum: ${expectedAllSum.toFixed(2)}, Actual Sum: ${actualAllSum.toFixed(2)}`);
          
          // Verify equality within a small tolerance margin
          expect(Math.abs(actualAllSum - expectedAllSum)).toBeLessThan(0.02);
        }
      }
    }
  }, 240000); // 4 minutes total timeout for this test
});
