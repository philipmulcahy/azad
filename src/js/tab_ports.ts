/* Copyright(c) 2026 Philip Mulcahy. */

// Helps background.ts pick the content page port to send a message to.

/*
 * The ports of root (not iframe) content pages in tab tabId, in key order.
 * background.ts keys its content ports `${port.name}#${tabId}#${url}`, and a
 * root page's port name starts 'azad_inject:'.
 */
export function rootPortsInTab(
  contentPorts: Record<string, chrome.runtime.Port>,
  tabId: number | undefined,
): chrome.runtime.Port[] {
  if (tabId === undefined) {
    return [];
  }

  return Object.keys(contentPorts)
    .filter(k => k.startsWith('azad_inject:'))
    .sort()
    .map(k => contentPorts[k])
    .filter(p => p.sender?.tab?.id === tabId);
}
