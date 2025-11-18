/* Copyright(c) 2025 Philip Mulcahy. */

'use strict';

const URL_STEM = 'https://azad-extension.co.uk/logs/';

export async function log(
  msg: { [index: string]: string },
): Promise<void> {

  const keys = Object.keys(msg).sort();

  const params = keys.map(
    function(k): string {
      const v: string = msg[k];
      return `${k}=${v}`;
    }
  );

  const paramString = params.join('&');
  const url = `${URL_STEM}?${paramString}`;
  console.log(`fetching HEAD for ${url}`);

  await fetch(
    url,
    {
      method: 'HEAD'
    }
  );
}
