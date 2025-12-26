import * as business from './business';
import * as cacheStuff from './cachestuff';
import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
import * as pageType from './page_type';
import * as signin from './signin';
import * as strategy from './strategy';
import * as urls from './url';
import * as util from './util';

function getCache() {
  return cacheStuff.createLocalCache('PERIODS');
}

export function clearCache() {
  getCache().clear();
}

async function getYears(): Promise<number[]> {
  return TODO;
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
  const inIframeWorker = pageType.isWorker();

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
  const years_key = 'YEARS';

  const cached = util.defaulted<number []>(await getCache().get(years_key), []);
  if (cached.length != 0) {
    console.log('extractYears() returning cached value', cached);
    return cached;
  }

  const url = await getUrl();

  async function getDoc(): Promise<Document> {
    console.log('fetching', url, 'for extractYears()');
    const readyXPath = '//option[contains(@id, "timeFilterDropdown")]';

    const response = await iframeWorker.fetchURL(
      url, readyXPath, 'extract available years');

    const html = response.html;
    const doc = util.parseStringToDOM(html);
    return doc;
  }

  try {
    const doc = await getDoc();
    const years: number[] = getYearsFromDoc(doc);
    console.log('extractYears() returning ', years);
    getCache().set(years_key, years);
    return years;
  } catch (exception) {
    console.error('extractYears() caught:', exception);
    return [];
  }
}

export function getYearsFromDoc(orders_page_doc: HTMLDocument): number[] {
  type Strategy = (orders_page_doc: HTMLDocument) => number[];

  const  strategy0: Strategy = function(doc: HTMLDocument) {
    const snapshot: Node[] = extraction.findMultipleNodeValues(
      '//select[@name="orderFilter" or @name="timeFilter"]/option[@value]',
      doc.documentElement,
    );

    const years = snapshot
      .filter( elem => elem )  // not null or undefined
      .filter( elem => elem.textContent )  // text content not null or empty
      .map(
        elem => elem!.textContent!
        .replace('en', '')  // amazon.fr
        .replace('nel', '')  // amazon.it
        .trim()
      )
      .filter( element => (/^\d+$/).test(element) )
      .map( (year_string: string) => Number(year_string) )
      .filter( year => (year >= 2004) )
      // TODO remove duplicates
      .sort();

    return years;
  };

  const  strategy1: Strategy = function(doc: HTMLDocument) {
    const snapshot: Node[] = extraction.findMultipleNodeValues(
      '//select[@id="timeFilterDropdown"]/option',
      doc.documentElement,
    );

    const years = snapshot
      .filter( elem => elem )  // not null or undefined
      .filter( elem => elem.textContent )  // text content not null or empty
      .filter( elem => (elem as HTMLElement).hasAttribute('value') )
      .map( elem => (elem as HTMLElement)!.getAttribute('value')!.trim() )
      .filter( yearString => (/^\d+$/).test(yearString) )
      .map( (year_string: string) => Number(year_string) )
      .filter( year => (year >= 2004) )
      // TODO remove duplicates
      .sort();

    return years;
  };

  const strategies = [strategy0, strategy1].map(s => () => s(orders_page_doc));
  return strategy.firstMatchingStrategy('getYears', strategies, []);
}

export async function scrapeAndAdvertise(
  getBackgroundPort: ()=>Promise<chrome.runtime.Port|null>
): Promise<void>
{
  const years = await extractYears();
  advertisePeriods(getBackgroundPort);
}
