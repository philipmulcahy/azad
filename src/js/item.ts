/* Copyright(c) 2017-2021 Philip Mulcahy. */

import * as util from './util';

export interface IItem {
    description(): string;
    url(): string;
    price():string;
}

export type Items = Record<string, string>;

export function extractItems(orderElem: HTMLElement): IItem[] {
    const itemElems: Node[] = util.findMultipleNodeValues(
        '//div[./div[./div[@class="a-row" and ./a[@class="a-link-normal"]] and .//span[contains(@class, "price") ]/nobr]]',
        orderElem
    );
    const items: IItem[] = <IItem[]>itemElems.map( itemElem => {
        const link = <HTMLElement>util.findSingleNodeValue(
            './/div[@class="a-row"]/a[@class="a-link-normal"]',
            <HTMLElement>itemElem
        );
        const description = util.defaulted(link.textContent, "").trim();
        const url = util.defaulted(link.getAttribute('href'), "").trim();
        let price = "";
        try {
            const priceElem = <HTMLElement>util.findSingleNodeValue(
                './/span[contains(@class, "price")]//nobr',
                <HTMLElement>itemElem
            );
            price = util.defaulted(priceElem.textContent, "").trim();
        } catch(ex) {
            console.warn('could not find price for: ' + description);
        }
        const item = {
            description: () => description,
            url: () => url,
            price: () => price,
        } 
        return item
    });
    return items;
}
