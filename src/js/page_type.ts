/* Copyright(c) 2025 Philip Mulcahy. */

export function isIframe(): boolean {
  const wellIsIt = window.self !== window.top;
  return wellIsIt;
}

export function isSignInPage(url: string): boolean {
  return url.includes('/ap/signin') || url.includes('/signin?');
}

// createIframe names each worker iframe after its task's guid (a v4 uuid),
// and the name survives navigation within the iframe.
function hasWorkerName(): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(window.name);
}

export function isWorker(): boolean {
  const inIframe = isIframe();
  const url = document.URL;

  // ${YOUR-DEITY} help us if iframes that aren't ours
  // start popping up that match these patterns.
  const relevantPage = url.includes('/transactions') ||
                       url.includes('/your-orders/orders') ||
                       url.includes('/your-orders/order-details') ||
                       url.includes('/order-history') ||
                       url.includes('/gp/css/order-history');

  // One of our workers that Amazon sent to sign in instead: it still needs
  // to report back, or whoever asked for the page waits for ever.
  const redirectedWorker = isSignInPage(url) && hasWorkerName();

  return inIframe && (relevantPage || redirectedWorker);
}

export function getPageType(): string {
  const iw = isWorker();

  return iw ?
    'azad_iframe_worker' :
    'azad_inject';
}

