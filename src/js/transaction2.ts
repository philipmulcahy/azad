// per #391, parsing a transactions page that has transaction data written in
// a "flattened" style, with obfuscated attribute names.

import {Transaction} from './transaction';


export function extractPageOfTransactions(doc: Document): Transaction[] {
  const text = doc.documentElement.textContent?.slice() ?? '';
  const reduced = text.replace(/\s*\n\s*/g, '\n');
  console.log(reduced);
  return [];
}
