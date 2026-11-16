/* Synthetic HTML fixtures only. No real Amazon order data. */

import {JSDOM} from 'jsdom';
import {fsa_hsa_eligible_amount} from '../../js/fsa_hsa';

function parse(html: string): HTMLDocument {
  return new JSDOM(html).window.document as HTMLDocument;
}

describe('Amazon-reported FSA/HSA order amount', () => {
  test('extracts explicit eligible amount, not the order total', () => {
    const doc = parse(`
      <div class="od-line-item-row">
        <div>Order Total:</div><div>$75.50</div>
      </div>
      <div class="od-line-item-row">
        <div>FSA or HSA eligible: (inc. tax and shipping)</div>
        <div>$12.34</div>
      </div>`);
    expect(fsa_hsa_eligible_amount(doc)).toBe('$12.34');
  });

  test('accepts an explicitly reported zero', () => {
    const doc = parse(`
      <div class="od-line-item-row">
        <span>FSA or HSA eligible:</span><span>$0.00</span>
      </div>`);
    expect(fsa_hsa_eligible_amount(doc)).toBe('$0.00');
  });

  test('does not infer a value from product-page labels or total', () => {
    const doc = parse(`
      <div data-component="healthBenefitAccountInformation">
        FSA or HSA eligible
      </div>
      <div class="od-line-item-row">
        <span>Order Total:</span><span>$29.80</span>
      </div>`);
    expect(fsa_hsa_eligible_amount(doc)).toBe('');
  });

  test('does not guess when Amazon displays ambiguous amounts', () => {
    const doc = parse(`
      <div class="od-line-item-row">
        <span>FSA or HSA eligible:</span>
        <span>$12.34</span><span>$75.50</span>
      </div>`);
    expect(fsa_hsa_eligible_amount(doc)).toBe('');
  });
});
