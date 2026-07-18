/* Copyright(c) 2025 Philip Mulcahy. */

import * as pageType from './page_type';

let background_port: chrome.runtime.Port | null = null;
const messageListeners: ((msg: unknown) => void)[] = [];

export function addMessageListener(listener: (msg: unknown) => void): void {
  messageListeners.push(listener);
  if (background_port) {
    background_port.onMessage.addListener(listener);
  }
}

async function initialiseBackgroundPort(): Promise<void> {
  const isWorker = pageType.isWorker();
  const isIframe = pageType.isIframe();

  if (isIframe && !isWorker) {
    // This extension didn't make this iframe,
    // so it (the iframe) doesn't need to receive messages.
    return;
  }

  const portUID: string = new Date().getUTCMilliseconds().toString();
  const pgType = pageType.getPageType();
  const portName = `${pgType}:${portUID}`;
  console.log(`AZAD_DIAGNOSTICS: initialiseBackgroundPort creating new port ${portName}`);
  background_port = chrome.runtime.connect({name: portName});

  for (const listener of messageListeners) {
    background_port.onMessage.addListener(listener);
  }

  function sendOneKeepalive() {
    background_port?.postMessage({action: 'keepalive'});
  }

  const keepaliveIntervalId = setInterval(sendOneKeepalive, 10_000);

  background_port.onDisconnect.addListener( _port => {
    console.warn(`AZAD_DIAGNOSTICS: background port disconnected ${pgType} ${portName}`);
    clearInterval(keepaliveIntervalId);
    background_port = null;
  });
}

export async function getBackgroundPort(): Promise<chrome.runtime.Port | null>
{
  if (!background_port) {
    await initialiseBackgroundPort();
  }

  return background_port;
}
