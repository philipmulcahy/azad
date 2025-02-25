import * as business from './business';
import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
import * as signin from './signin';
import * as urls from './url';
import * as util from './util';

let setYears: (years: number[])=>void;

const yearsPromise = new Promise<number[]>((resolve, _reject) => {
  let years: number[] = [];

  setYears = function(years: number[]) {
    resolve(years);
  }
});

function getYears(): Promise<number[]> {
  return yearsPromise;
}

async function getPeriods(): Promise<number[]> {
  const years = await getYears();
  const periods = years.length == 0 ? [] : [1, 2, 3].concat(years);
  return periods;
}

export async function getLatestYear(): Promise<number> {
  const all_years = [...await getYears()];
  all_years.sort();
  return all_years.at(-1) ?? -1;
}

export async function advertisePeriods(
  getBackgroundPort: ()=>Promise<chrome.runtime.Port|null>
): Promise<void> {
  const periods = await getPeriods();
  const noPeriods = periods.length == 0;
  const bg_port = await getBackgroundPort();
  const inIframeWorker = iframeWorker.isWorker();

  if (bg_port) {
    try {
      if (noPeriods && !inIframeWorker) {
        console.log('no periods found in naked page -> try iframe worker');
        const url = await getUrl();

        bg_port.postMessage({
          action: 'scrape_periods',
          url: url,
        });
      } else {
        console.log('advertising periods', periods);

        bg_port.postMessage({
          action: 'advertise_periods',
          periods: periods,
        });
      }
    } catch (ex) {
      console.warn(
        'periods.advertisePeriods got: ', ex,
        ', perhaps caused by disconnected bg_port?');
    }
  } else {
    console.warn('periods.advertisePeriods got no background port');
  }
}

async function getUrl(): Promise<string> {
  const isBusinessAcct = await business.isBusinessAccount();

  const url = isBusinessAcct ?
    business.getBaseOrdersPageURL():
    urls.normalizeUrl(
      '/gp/css/order-history?ie=UTF8&ref_=nav_youraccount_orders',
      urls.getSite());

  return url;
}

async function extractYears(): Promise<number[]> {
  const url = await getUrl();
  const inIframe = iframeWorker.isWorker();

  async function getDoc(): Promise<Document> {
    if (inIframe) {
      // Wait a second to allow page javascript to render.
      await new Promise(r => setTimeout(r, 1000));
      return document;
    } else {
      console.log('fetching', url, 'for getYears()');
      const response = await signin.checkedFetch(url);
      const html = await response.text();
      const doc = util.parseStringToDOM(html);
      return doc;
    }
  }

  try {
    const doc = await getDoc();
    const years: number[] = extraction.get_years(doc);
    console.log('getYears() returning ', years);
    return years
  } catch (exception) {
    console.error('getYears() caught:', exception);
    return [];
  }
}

export async function init(
  getBackgroundPort: ()=>Promise<chrome.runtime.Port|null>
): Promise<void>
{
  const years = await extractYears();
  setYears(years);
  const inIframe = iframeWorker.isWorker();

  if (!inIframe) {
    advertisePeriods(getBackgroundPort);
  }
};
