/* Copyright(c) 2023 Philip Mulcahy. */

'use strict';

import * as fs from 'fs';

export function doc_from_html_file_path(path: string): HTMLDocument {
  const text = fs.readFileSync(path, 'utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(
      text, 'text/html'
  );
  return doc;
}

'use strict';
