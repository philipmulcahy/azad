/* Copyright(c) 2025 Philip Mulcahy. */

import * as statistics from './statistics';

/*
 * Iterate through strategies, executing its elements until one returns a T,
 * catching and swallowing any exceptions.
 * Null, empty strings and isNaN values are considered as bad as exceptions.
 * If no element returns a valid T, then return defaultValue.
*/
export function firstMatchingStrategy<T>(
  callSiteName: string,  // used to identify the stats for this call site.
  strategies: Array<()=>T>,
  defaultValue: T,
): T {
  for (let iStrategy: number = 0; iStrategy < strategies.length; ++iStrategy) {
    const strategy = strategies[iStrategy];

    try {
      const candidate = strategy();

      if (isValid(candidate)) {
        statistics.StrategyStats.reportSuccess(callSiteName, iStrategy);
        return candidate as T;
      } else {
        console.debug(
          strategy.name +
          ' returned invalid candidate: moving to next strategy or default');
      }
    } catch (_ex) {
      console.debug(
        `${strategy.name} blew up: moving to next strategy or default`);
    }
  }

  statistics.StrategyStats.reportFailure(callSiteName);
  return defaultValue;
}

/* Same as firstMatchingStrategy, but async. */
export async function firstMatchingStrategyAsync<T>(
  callSiteName: string,  // used to identify the stats for this call site.
  strategies: Array<()=>Promise<T>>,
  defaultValue: T,
): Promise<T> {

  for (let iStrategy: number = 0; iStrategy < strategies.length; ++iStrategy) {
    const strategy = strategies[iStrategy];

    try {
      const candidate = await strategy();

      if (isValid(candidate as T)) {
        statistics.StrategyStats.reportSuccess(callSiteName, iStrategy);
        return candidate as T;
      } else {
        console.debug(
          strategy.name +
          ' returned invalid candidate: moving to next strategy or default');
      }
    } catch (_ex) {
      console.debug(
        `${strategy.name} blew up: moving to next strategy or default`);
    }
  }

  statistics.StrategyStats.reportFailure(callSiteName);
  return defaultValue;
}

function isValid<T>(t: T): boolean {
  if (t === null) {
    return false;
  }

  if (t === undefined) {
    return false;
  }

  if (t === '') {
    return false;
  }

  if (typeof(t) == 'number') {
    if (isNaN(t)) {
      return false;
    }
  }

  if (t instanceof Date) {
    if (isNaN(t.getTime())) {
      return false;
    }
  }

  if (Array.isArray(t)) {
    if (t.length == 0) {
      return false;
    }
  }

  return true;
}

/*
 * Execute all strategies, catching and swallowing any exceptions.
 * Return the result that score the highest (most +ve) according to fScore.
 * Null, empty strings and isNaN values are considered as bad as exceptions.
 * Negative scores are considered to signify an invalid result.
 * If no element returns a valid T, then return defaultValue.
*/
export function bestMatchingStrategy<T>(
  callSiteName: string,  // used to identify the stats for this call site.
  strategies: Array<()=>T>,
  fScore: (t: T) => number,
  defaultValue: T,
): T {
  type ScoredResult = {
    result: T,
    score: number,  // -ve means invalid
  };

  function run(iStrategy: number): ScoredResult {
    function scorer(t: T): ScoredResult{
      if (!isValid(t)) {
        return {
          result: defaultValue,
           score: -1
        };
      }

      const score = fScore(t);

      return {
        result: t,
        score,
      };
    }

    try {
      const strategy = strategies[iStrategy];
      const candidate = strategy();
      const scored = scorer(candidate);
      return scored;
    } catch (_ex) {
      console.debug(
        `${iStrategy} blew up.`);
    }

    return {
      result: defaultValue,
      score: -1,
    };
  }

  const results = strategies.map((_, i) => run(i));
  const maxScore = Math.max(...results.map(r => r.score));

  for (const r of results) {
    if (r.score == maxScore && r.score >= 0) {
      statistics.StrategyStats.reportSuccess(callSiteName, results.indexOf(r));
      return r.result;
    }
  }

  statistics.StrategyStats.reportFailure(callSiteName);
  return defaultValue;
}