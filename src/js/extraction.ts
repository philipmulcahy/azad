/* Copyright(c) 2019-2023 Philip Mulcahy. */

/* jshint strict: true, esversion: 6 */

import * as util from './util';
const xpath = require('xpath');

"use strict";

// Considers only the first match for each xpath.
export function by_regex(
  xpaths: string[],  // the priority ordered list of regular expressions.
  regex: RegExp | null,  // if supplied, and matched, the string returned will be first match.
  default_value: string|null,
  elem: HTMLElement,  // the element that will be searched (including its descendants).
  context: string,  // for log messages and debugging only.
): string | null {
  let i;
  for ( i=0; i!=xpaths.length; i++ ) {
    let a = null;
    const xpath = xpaths[i];
    try {
      a = findSingleNodeValue(
        xpath,
        elem,
        context,
      );
    } catch ( ex ) {
      console.debug('Caught ' + JSON.stringify(ex));
    }
    if ( a ) {
      if ( regex ) {
        const match: RegExpMatchArray | null | undefined
          = a.textContent?.trim().match(regex);
        if (match !== null && typeof(match) !== 'undefined') {
          return match[1];
        }
      }
      return util.defaulted(a.textContent?.trim(), null);
    }
  }

  try {
    return default_value!.toString();
  } catch {
    return null;
  }
}

// Consider every xpath match, not just the first match for each xpath.
export function by_regex2(
  xpaths: string[],
  regex: RegExp,
  default_value: string|number|null,
  elem: HTMLElement,
  context: string,
): string | null {
  for ( let i=0; i!=xpaths.length; i++ ) {
    const xpath = xpaths[i];
    try {
      const candidate_nodes: Node[] = findMultipleNodeValues(
        xpath,
        elem,
        context,
      );
      for ( let j=0; j!=candidate_nodes.length; j++ ) {
        const candidate_node = candidate_nodes[j];
        const match: RegExpMatchArray | null | undefined
          = candidate_node.textContent?.trim().match(regex);
        if (match !== null && typeof(match) !== 'undefined') {
          return match[1];
        }
      }
    } catch ( ex ) {
      console.debug('Caught ' + JSON.stringify(ex) + 'while doing:' + context);
    }
  }
  try {
    return default_value!.toString();
  } catch {
    return null;
  }
}

/*
 * Iterate through strategies, executing its elements until one returns a T,
 * catching and swallowing any exceptions.
 * Null, empty strings and isNaN values are considered as bad as exceptions.
 * If no element returns a valid T, then return defaultValue.
*/
export function firstMatchingStrategy<T>(
  strategies: Array<()=>T|null>,
  defaultValue: T
): T {
  function isValid(t: T|null): boolean {
    if (t == null) {
      return false;
    }

    if (t == '') {
      // this also works for an empty array: it's javascript - what more is there to say?
      return false;
    }

    if (typeof(t) == 'undefined') {
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

    return true;
  }

  for (const strategy of strategies) {
    try {
      const candidate = strategy();
      if (isValid(candidate)) {
        return candidate as T;
      } else {
        console.debug(`${strategy.name} returned invalid candidate: moving to next strategy or default`);
      }
    } catch (_ex) {
      console.debug(`${strategy.name} blew up: moving to next strategy or default`);
    }
  }

  return defaultValue;
}

/*
 * Returns selected html text from an HTML element targetted by an xpath.
 *
 * @param xpath - xpath string that targets the element whose text should be
 *                returned.
 * @param elem - HTMLElement from which the root of the xpath should launch.
 *               This could be the document's root element.
 * @param context - debugging context - has no effect aside from potentially being logged.
 *
 * @returns the html text or null if the xpath is not matched.
 */
function getField(
  xpath: string,
  elem: HTMLElement,
  context: string
): string|null {
  try {
    const valueElem = findSingleNodeValue(xpath, elem, context);
    return valueElem!.textContent!.trim();
  } catch (_) {
    return null;
  }
}

/*
 * Returns selected html text from an HTML element targetted by a prioritised
 * list of xpaths.
 *
 * @param xpaths - xpath string list that targets the element whose text should
 *                 be returned.
 * @param elem - HTMLElement from which the root of the xpaths should launch.
 *               This could be the document's root element.
 * @param defaultValue - what to return if none of the xpaths match.
 * @param context - debugging context - has no effect aside from potentially
 *                  being logged.
 *
 * @returns the html text or defaultValue if no xpath matches.
 */
export function getField2(
  xpaths: string[],
  elem: HTMLElement,
  defaultValue: string,
  context: string,
): string {
  for (const xpath of xpaths) {
    const candidate = getField(xpath, elem, context);

    if (candidate != null) {
      return candidate;
    }
  }

  return defaultValue;
}

export function findSingleNodeValue(
    xpath: string, elem: HTMLElement, context: string
): Node {
  try {
    const node = elem.ownerDocument!.evaluate(
      xpath,
      elem,
      null,
      getXPathResult().FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;

    if (!node) {
      throw 'No node found';
    }

    return node;
  } catch (ex) {
    const msg = (
      'findSingleNodeValue didn\'t match: ' + xpath
  ) + (
    context ?
      ('; Context:' + context) :
      ''
  ) + '; ' + JSON.stringify(ex);
    throw msg;
  }
}

export function findMultipleNodeValues(
  xpath: string,
  elem: HTMLElement,
  context: string = 'unknown',
): Node[] {
  try {
    const snapshot = elem.ownerDocument!.evaluate(
      xpath,
      elem,
      null,
      getXPathResult().ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const values: Node[] = [];
    let i;

    for(i = 0; i !== snapshot.snapshotLength; i += 1) {
      const node: Node|null = snapshot.snapshotItem(i);

      if (node) {
        values.push(node);
      }
    }

    return values;
  } catch( ex ) {
    throw 'Unknown exception from findMultipleNodeValues: ' + context + ' ' + (ex as string).toString();
  }
}

function getXPathResult() {
  if (typeof(XPathResult) === 'undefined') {
    return xpath.XPathResult;
  }

  return XPathResult;
}
