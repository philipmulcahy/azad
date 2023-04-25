/* Copyright(c) 2020 Philip Mulcahy. */

'use strict';

export function getSite(): string {
    if ( typeof( window ) === 'undefined' ) {
        return 'www.azadexample.com'
    }
    const href = window.location.href;
    const regex = new RegExp(
        'https:\\/\\/(www\\.amazon\\.[^\\/]+)'
    );
    const executed = regex.exec(href);
    if (!executed || executed.length < 1) {
        console.error('didn\'t get a match for site from: ' + href);
        return 'www.azadexample.com';
    }
    const stem = executed[1];
    return stem;
}

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
}

export function orderDetailUrlFromListElement(
    elem: HTMLElement,
    orderId: string,
    site: string
): string {
    const patterns: string[] = ['order-detail', 'order-summary'];
    const matching_urls: string[] = Array.from(elem.querySelectorAll('a'))
        .filter( a => a.hasAttribute('href') )
        .map( a => a.getAttribute('href') )
        .filter( notEmpty )
        .filter(
            url => patterns.map(
                pattern => (url && url.includes(pattern))
            ).some( matches => matches )
        );
    if ( matching_urls.length) {
        return matching_urls[0];
    }
    console.warn('could not find order detail url for ' + orderId + ' so we are inventing one');
    return getDefaultOrderDetailUrl(orderId, site);
}

function getDefaultOrderDetailUrl(orderId: string, site: string) {
    if (orderId.startsWith('D')) {
       return  'https://' + site + '/gp/your-account/order-history/' +
               'ref=ppx_yo_dt_b_search?opt=ab&search=' + orderId;
    }
    return 'https://' + site + '/gp/your-account/order-details/' +
           'ref=oh_aui_or_o01_?ie=UTF8&orderID=' + orderId;
}

export function getOrderPaymentUrl(orderId: string, site: string) {
    if ( !orderId ) {return 'N/A'; }
    return orderId.startsWith('D') ?
        'https://' + site + '/gp/digital/your-account/order-summary.html' +
            '?ie=UTF8&orderID=' + orderId + '&print=1&' :
        'https://' + site + '/gp/css/summary/print.html' +
            '/ref=oh_aui_ajax_pi?ie=UTF8&orderID=' + orderId;
}

export function normalizeUrl(url: string): string {
    const site = getSite();
    if (!url.startsWith('https://')) {
        if(!url.startsWith(site)) {
            url = site + url;
        }
        url = 'https://' + url;
    }
    return url;
}
