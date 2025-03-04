/* Copyright(c) 2025 Philip Mulcahy. */

export function isIframe(): boolean {
  const wellIsIt = window.self !== window.top;
  return wellIsIt;
}

export function isWorker(): boolean {
  const inIframe = isIframe();
  const url = document.URL;

  // ${YOUR-DEITY} help us if iframes that aren't ours
  // start popping up that match these patterns.
  const relevantPage = url.includes('/transactions') ||
                       url.includes('/your-orders/orders') ||
                       url.includes('/order-history') ||
                       url.includes('/gp/css/order-history');

  return inIframe && relevantPage;
}

export function getPageType(): string {
  const iw = isWorker();

  return iw ?
    'azad_iframe_worker' :
    'azad_inject';
}

