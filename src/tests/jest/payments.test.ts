import * as fs from 'fs';
const jsdom = require('jsdom');

import * as pmt from '../../js/payment';

async function scrapePaymentsFromOrderDetailDocUsingTopology(
  htmlFilePath: string
): Promise<pmt.Payments> {
  const html: string = fs.readFileSync(htmlFilePath, 'utf8');

  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  virtualConsole.on("jsdomError", (err: Error) => {
    if (err.message != 'Could not parse CSS stylesheet') {
      console.error(err);
    }
  });

  const doc = new jsdom.JSDOM(html, {virtualConsole}).window.document;
  const date = new Date('2025-12-31');
  const amount = '£99.99';
  return pmt.paymentsFromOrderDetailDocUsingTopology(doc, date, amount);
}

describe('can read some payments', () => {
  test(
    'FHNaber', async () => {
      const paymentsPromise = scrapePaymentsFromOrderDetailDocUsingTopology(
        './src/tests/azad_test_data/payments/amazon.com/FHNaber/' +
        '114-0232842-2905059.order_details.cooked.html'
      );

      const payments = await paymentsPromise;
      expect(payments.length).toEqual(1);
  });
});
