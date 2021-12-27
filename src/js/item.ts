/* Copyright(c) 2017-2021 Philip Mulcahy. */

import * as azad_entity from './entity';
import * as util from './util';
import { IRequestScheduler, IResponse } from './request_scheduler';

export interface IItem extends azad_entity.IEntity {
    description: string;
    order_date: string;
    order_detail_url: string;
    order_id: string;
    price: string;
    quantity: number;
    category: string;
    url: string;
};

export type Items = Record<string, string>;

type ItemsExtractor = (
    order_id: string,
    order_date: string,
    order_detail_url: string,
    order_elem: HTMLElement,
    context: string,
) => IItem[];

export function extractItems(
    order_id: string,
    order_date: string,
    order_detail_url: string,

    // this is the only input essential to this function, the rest are just merged with the output hash
    order_elem: HTMLElement,

    // it seems like context is just used for logging and is not essential to any of the strategy logic
    context: string,
): IItem[] {
    const strategies: ItemsExtractor[] = [
        strategy0,
        strategy1,
        strategy2,
        strategy3,
    ];
    for (let i=0; i!=strategies.length; i+=1) {
        const strategy: ItemsExtractor = strategies[i];
        try {
            const items = strategy(
                order_id,
                order_date,
                order_detail_url,
                order_elem,
                context + ';extractItems:strategy:' + i,
            );

            if (items.length) {
                return items;
            }
        } catch (ex) {
            console.error('strategy' + i.toString() + ' ' + ex);
        }
    }

    return [];
}


// TODO not the best place for this method, should rearrange and possibly change the callsite where this is used
export function getCategoriesForProduct(scheduler: IRequestScheduler, productUrl: string): Promise<string> {
    return scheduler.scheduleToPromise<string>(
        productUrl,
        // the result of this transformation is cached; clear cache when debugging & changing this line
        // the scheduler cache uses localstorage which has a very limited storage size, so do not store full page results
        (evt) => {
            const productPage = util.parseStringToDOM(evt.target.responseText);
            return util.findSingleNodeValue('//*[@id="wayfinding-breadcrumbs_feature_div"]/ul', productPage.documentElement, '').textContent.
                // remove all duplicate spaces and newlines. This creates a reasonably formatted category breadcrumb.
                replace(/\n|\r|[ ]{2,}/g, "")
        },
        '00000',
        false
    ).then((response: IResponse<string>) => response.result);
}

function strategy0(
    // TODO these values are just appended to the resulting object; this could be done in `extractItems` instead
    order_id: string,
    order_date: string,
    order_detail_url: string,

    order_elem: HTMLElement,

    context: string
): IItem[] {
    const itemElems: Node[] = util.findMultipleNodeValues(
        '//div[./div[./div[@class="a-row" and ./a[@class="a-link-normal"]] and .//span[contains(@class, "price") ]]]',
        order_elem
    );
    const items: IItem[] = <IItem[]>itemElems.map( itemElem => {
        const productLink = <HTMLElement>util.findSingleNodeValue(
            './/div[@class="a-row"]/a[@class="a-link-normal"]',
            <HTMLElement>itemElem,
            context,
        );
        const description = util.defaulted(productLink.textContent, '').trim();
        const amazonProductURL = util.defaulted(productLink.getAttribute('href'), '').trim();

        let qty: number = 0;
        try {
            qty = parseInt(
                util.defaulted(
                    util.findSingleNodeValue(
                        './/span[@class="item-view-qty"]',
                        <HTMLElement>itemElem,
                        context,
                    ).textContent,
                    '1'
                ).trim()
            );
        } catch(ex) {
            qty = 1;
            if (!ex.includes('match')) {
                console.log(ex);
            }
        }
        let price = '';
        try {
            const priceElem = <HTMLElement>util.findSingleNodeValue(
                './/span[contains(@class, "price")]',
                <HTMLElement>itemElem,
                context,
            );
            price = util.defaulted(priceElem.textContent, '').trim();
        } catch(ex) {
            console.warn('could not find price for: ' + description);
        }

        return {
            order_date: order_date,
            order_id: order_id,
            order_detail_url: order_detail_url,

            description: description,
            price: price,
            quantity: qty,
            category: '',
            url: amazonProductURL,
        }
    });
    return items;
}

// Digital orders.
function strategy1(
    order_id: string,
    order_date: string,
    order_detail_url: string,

    order_elem: HTMLElement,

    context: string,
): IItem[] {
    const itemElems: Node[] = util.findMultipleNodeValues(
        '//*[contains(text(), "Ordered") or contains(text(), "Commandé")]/parent::*/parent::*/parent::*',
        order_elem
    );
    const items: IItem[] = <IItem[]>itemElems.map( itemElem => {
        const link = <HTMLElement>util.findSingleNodeValue(
            './/a[contains(@href, "/dp/")]',
            <HTMLElement>itemElem,
            context,
        );
        const description = util.defaulted(link.textContent, '').trim();
        const url = util.defaulted(link.getAttribute('href'), '').trim();
        const qty_match = link.parentNode
                             ?.parentNode
                             ?.textContent
                             ?.match(/Qty: (\d+)/);
        const sqty = qty_match ? qty_match[1] : '1';
        const qty = parseInt(sqty);
        const price_match = link.parentNode
                               ?.parentNode
                               ?.nextSibling
                               ?.nextSibling
                               ?.textContent
                               ?.match(util.moneyRegEx())
        const price = price_match ? price_match[1] : '';
        return {
            description: description,
            order_date: order_date,
            order_detail_url: order_detail_url,
            order_id: order_id,
            price: price,
            quantity: qty,
            url: url,
        }
    });
    return items;
}

// Amazon.com 2016
function strategy2(
    order_id: string,
    order_date: string,
    order_detail_url: string,
    order_elem: HTMLElement,
    context: string,
): IItem[] {
    const itemElems: Node[] = util.findMultipleNodeValues(
        '//div[contains(@id, "orderDetails")]//a[contains(@href, "/product/")]/parent::*',
        order_elem
    );
    const items: IItem[] = <IItem[]>itemElems.map( itemElem => {
        const link = <HTMLElement>util.findSingleNodeValue(
            './/a[contains(@href, "/product/")]',
            <HTMLElement>itemElem,
            context,
        );
        const description = util.defaulted(link.textContent, '').trim();
        const url = util.defaulted(link.getAttribute('href'), '').trim();
        const qty_match = link.parentNode
                             ?.parentNode
                             ?.textContent
                             ?.match(/Qty: (\d+)/);
        const sqty = qty_match ? qty_match[1] : '1';
        const qty = parseInt(sqty);
        const price_match = link.parentNode
                               ?.parentNode
                               ?.nextSibling
                               ?.nextSibling
                               ?.textContent
                               ?.match(util.moneyRegEx())
        const price = price_match ? price_match[1] : '';
        return {
            description: description,
            order_date: order_date,
            order_detail_url: order_detail_url,
            order_id: order_id,
            price: price,
            quantity: qty,
            url: url,
        }
    });
    return items.filter( item => item.description != '' );
}
// This strategy works for Amazon.com grocery orders in 2021.
function strategy3(
    order_id: string,
    order_date: string,
    order_detail_url: string,
    order_elem: HTMLElement,
    context: string,
): IItem[] {
    const itemElems: Node[] = util.findMultipleNodeValues(
        '//div[contains(@class, "a-section")]//span[contains(@id, "item-total-price")]/parent::div/parent::div/parent::div',
        order_elem
    );
    const items: IItem[] = <IItem[]>itemElems.map( itemElem => {
        const link = <HTMLElement>util.findSingleNodeValue(
            './/a[contains(@class, "a-link-normal") and contains(@href, "/product/")]',
            <HTMLElement>itemElem,
            context,
        );
        const description = util.defaulted(link.textContent, '').trim();
        const url = util.defaulted(link.getAttribute('href'), '').trim();
        const sqty = link.parentNode?.nextSibling?.textContent?.trim() ?? "1";
        const qty = parseInt(sqty);
        let price = '';
        try {
            const priceElem = <HTMLElement>util.findSingleNodeValue(
                './/span[contains(@id, "item-total-price")]',
                <HTMLElement>itemElem,
                context,
            );
            price = util.defaulted(priceElem.textContent, '').trim();
        } catch(ex) {
            console.warn('could not find price for: ' + description);
        }
        return {
            description: description,
            order_date: order_date,
            order_detail_url: order_detail_url,
            order_id: order_id,
            price: price,
            quantity: qty,
            url: url,
        }
    });
    return items;
}
