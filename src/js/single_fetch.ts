/* Copyright(c) 2025 Philip Mulcahy. */

import * as notice from './notice';
import * as request from './request';
import * as request_scheduler from './request_scheduler';
import * as signin from './signin';
import * as statistics from './statistics';

export function checkedStaticFetch(url: string): Promise<Response> {
  return fetch(url).then(
    (response: Response) => {
      signin.checkSigninRedirect(response, url);
      console.log('fetched', url);
      return response;
    },
    err => {
      const msg = 'Got error while fetching debug data for: ' + url + ' ' + err;
      console.warn(msg);
      notice.showNotificationBar(msg, document);
      throw err;
    }
  );
}

export async function checkedDynamicFetch(
  url: string,
  requestType: string,
  readyXPath: string,
  getScheduler: () => request_scheduler.IRequestScheduler
) : Promise<string>
{
  console.log(`checkedDynamicFetch(${url}, ${requestType}, ${readyXPath}, ...) starting`);
  const stats = new statistics.Statistics;  // not going to be reported!
  const converter: request.EventConverter<string> = (evt: request.Event) => evt.target.responseText;
  const scheduler = await getScheduler();

  try {
    const txt = await request.makeAsyncDynamicRequest(
      url,
      requestType,
      converter,
      readyXPath,
      scheduler,
      '0',  // priority
      true,  // nocache
      `single_fetch.checkedDynamicFetch(${url}...`,
    );

    console.log(`checkedDynamicFetch(${url}, ${requestType}, ${readyXPath}, ...) complete`);
    return txt;
  } catch (ex) {
    console.warn(`checkedDynamicFetch(${url}, ${requestType}, ${readyXPath}, ...) failed: ${ex}`);
    return JSON.stringify(ex);
  }
}
