import * as business from './business';
import * as cacheStuff from './cachestuff';
import * as extraction from './extraction';
import * as iframeWorker from './iframe-worker';
import * as pageType from './page_type';
import * as requestScheduler from './request_scheduler';
import * as signin from './signin';
import * as strategy from './strategy';
import * as urls from './url';
import * as util from './util';

type YearsCacheValue = {
  expiryTimestampMillis: number;
  years: number[];
};

export class YearsCache {
  private static CACHE_KEY = 'YEARS';

  private static get() {
    return cacheStuff.createLocalCache('PERIODS');
  }

  static clear() {
    YearsCache.get().clear();
  }

  // returns [] if anything goes wrong,
  // such as expiry of the previously stored entry
  // or there being no entry there, or it being corrupt.
  static async readYears(): Promise<number[]> {
    try {
      const nowTimestampMillis: number = new Date().getTime();
      const result = await YearsCache.get().get(YearsCache.CACHE_KEY);
      const decoded = JSON.parse(result) as YearsCacheValue;
      if (nowTimestampMillis > decoded.expiryTimestampMillis) {
        throw new Error('cached years value too old');
      }
      return decoded.years;
    } catch (_) {
      return Promise.resolve([]);
    }
  }

  static async writeYears(years: number[]): Promise<void> {
    const now = new Date().getTime();
    const expiry = now + (2 * 24 * 60 * 60 * 1000);  // 48h later.

    const cacheValue: YearsCacheValue = {
      expiryTimestampMillis: expiry,
      years
    };

    const packedValue = JSON.stringify(cacheValue);

    await YearsCache.get().set(YearsCache.CACHE_KEY, packedValue);
    return;
  }
}

function yearsToPeriods(years: number[]) {
  return years.length == 0 ? [] : [1, 2, 3].concat(years);
}

export async function getPeriods(
  scheduler: requestScheduler.IRequestScheduler,
): Promise<number[]> {
  const years = await getYears(scheduler);
  return yearsToPeriods(years);
}

export async function getLatestYear(): Promise<number> {
  const all_years = [...await getYearsFromCache()];
  all_years.sort();
  return all_years.at(-1) ?? -1;
}

export async function advertisePeriods(
  scheduler: requestScheduler.IRequestScheduler
): Promise<void> {
  const periods = await getPeriods(scheduler);

  try {
    console.log('advertising periods', periods);
  } catch (ex) {
    console.warn(
      'periods.advertisePeriods caught: ', ex);
  }
}

async function getUrl(
  scheduler: requestScheduler.IRequestScheduler
): Promise<string> {
  const isBusinessAcct = await business.isBusinessAccount(scheduler);

  const url = isBusinessAcct ?
    business.getBaseOrdersPageURL():
    urls.normalizeUrl(
      '/gp/css/order-history?ie=UTF8&ref_=nav_youraccount_orders',
      urls.getSite());

  return url;
}

export async function getPeriodsFromCache(): Promise<number[]> {
  return yearsToPeriods(await getYearsFromCache());
}

function getYearsFromCache(): Promise<number[]> {
  return YearsCache.readYears();
}

async function getYears(
  scheduler: requestScheduler.IRequestScheduler
): Promise<number[]> {
  // Only called if we've not got a valid cached value.
  async function reallyGetYears(): Promise<number[]> {
    const years = await getYearsFromHtml(scheduler);
    await YearsCache.writeYears(years);
    return years;
  }

  return strategy.firstMatchingStrategyAsync<number[]>(
    'periods.getYears()',
    [
      getYearsFromCache,
      reallyGetYears,
    ],
    []
  );
}

async function getYearsFromHtml(
  scheduler: requestScheduler.IRequestScheduler
): Promise<number[]> {
  const url = await getUrl(scheduler);

  async function getDoc(): Promise<Document> {
    console.log('fetching', url, 'for getYears()');
    const readyXPath = '//option[contains(@id, "timeFilterDropdown")]';

    const response = await iframeWorker.fetchURL(
      url, readyXPath, 'extract available years', scheduler);

    const html = response.html;
    const doc = util.parseStringToDOM(html);
    return doc;
  }

  try {
    const doc = await getDoc();
    const years: number[] = yearsFromDoc(doc);
    console.log('extractYears() returning ', years);
    return years;
  } catch (exception) {
    console.error('extractYears() caught:', exception);
    return [];
  }
}

export function yearsFromDoc(ordersPage: HTMLDocument): number[] {
  type Strategy = () => number[];

  const  strategy0: Strategy = function() {
    const snapshot: Node[] = extraction.findMultipleNodeValues(
      '//select[@name="orderFilter" or @name="timeFilter"]/option[@value]',
      ordersPage.documentElement,
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

  const  strategy1: Strategy = function() {
    const snapshot: Node[] = extraction.findMultipleNodeValues(
      '//select[@id="timeFilterDropdown"]/option',
      ordersPage.documentElement,
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

  return strategy.firstMatchingStrategy(
    'yearsFromDoc',
    [strategy0, strategy1],
    []
  );
}
