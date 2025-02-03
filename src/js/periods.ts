import * as business from './business';
import * as extraction from './extraction';
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

async function advertisePeriods(
  getBackgroundPort: ()=>Promise<chrome.runtime.Port|null>
) {
  const periods = await getPeriods();
  console.log('advertising periods', periods);
  const bg_port = await getBackgroundPort();
  if (bg_port) {
    try {
      bg_port.postMessage({
        action: 'advertise_periods',
        periods: periods
      });
    } catch (ex) {
      console.warn(
        'inject.advertisePeriods got: ', ex,
        ', perhaps caused by disconnected bg_port?');
    }
  }
}

async function extractYears(): Promise<number[]> {
  const isBusinessAcct = await business.isBusinessAccount();

  const url = isBusinessAcct ?
    business.getBaseOrdersPageURL():
    urls.normalizeUrl(
      '/gp/css/order-history?ie=UTF8&ref_=nav_youraccount_orders',
      urls.getSite());

  try {
    console.log('fetching', url, 'for getYears()');
    const response = await signin.checkedFetch(url);
    const html = await response.text();
    const doc = util.parseStringToDOM(html);
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
  advertisePeriods(getBackgroundPort);
};
