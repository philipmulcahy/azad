/* Copyright(c) 2025 Philip Mulcahy. */

import * as pageType from './page_type';

let background_port: chrome.runtime.Port | null = null;

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

  // @ts-ignore null IS allowed as first arg to connect.
  background_port = chrome.runtime.connect(null, {name: portName});

  background_port.onDisconnect.addListener( _port => {
    background_port = null;
  });
}

export async function getBackgroundPort(): Promise<chrome.runtime.Port | null> {
  if (!background_port) {
    await initialiseBackgroundPort();
  }

  return background_port;
}
