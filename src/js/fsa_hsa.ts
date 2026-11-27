/* Extract an FSA/HSA eligible amount only when Amazon explicitly states it.
 * Blank means "not reported", NOT "ineligible".
 */

const ELIGIBLE_LABEL = /FSA\s*(?:or|\/)\s*HSA\s*eligible\s*:?/i;
const USD_AMOUNT = /\$\s*\d[\d,]*(?:\.\d{2})?/g;

/**
 * Extract the order-level amount from Amazon's order summary.
 * Do not examine product-page labels here: an eligible product does not
 * establish an eligible order amount after discounts, tax or shipping.
 */
export function fsa_hsa_eligible_amount(doc: HTMLDocument): string {
  // Amazon's newer order details layout has an explicit total line item.
  const rows = doc.querySelectorAll('.od-line-item-row');
  for (const row of Array.from(rows)) {
    const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
    if (!ELIGIBLE_LABEL.test(text)) continue;
    const amounts = text.match(USD_AMOUNT);
    if (amounts && amounts.length === 1) {
      return amounts[0].replace(/\s+/g, '');
    }
  }
  return '';
}

/**
 * Only accept the product-specific health-benefit label. Other references
 * to FSA/HSA (navigation, suggestions, help text) do not prove eligibility.
 */
export function product_fsa_hsa_eligible(doc: HTMLDocument): boolean {
  const label = doc.querySelector('#hbaLabel_feature_div');
  if (!label) return false;
  const text = (label.textContent || '').replace(/\s+/g, ' ').trim();
  return /\bFSA\s*(?:or|\/)\s*HSA\s*eligible\b/i.test(text);
}
