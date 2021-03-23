/* Copyright(c) 2017-2021 Philip Mulcahy. */

import * as azad_entity from './entity';
import * as util from './util';

export interface IItem extends azad_entity.IEntity {
    description: string;
    url: string;
    price: string;
    quantity: number;
    order_id: string;
};

export type Items = Record<string, string>;

export function extractItems(
    order_id: string, order_elem: HTMLElement
): IItem[] {
    const itemElems: Node[] = util.findMultipleNodeValues(
        '//div[./div[./div[@class="a-row" and ./a[@class="a-link-normal"]] and .//span[contains(@class, "price") ]/nobr]]',
        order_elem
    );
    const items: IItem[] = <IItem[]>itemElems.map( itemElem => {
        const link = <HTMLElement>util.findSingleNodeValue(
            './/div[@class="a-row"]/a[@class="a-link-normal"]',
            <HTMLElement>itemElem
        );
        const description = util.defaulted(link.textContent, '').trim();
        const url = util.defaulted(link.getAttribute('href'), '').trim();
        let qty: number = 0;
        try {
            qty = parseInt(
                util.defaulted(
                    util.findSingleNodeValue(
                        '//span[@class="item-view-qty"]',
                        <HTMLElement>itemElem
                    ).textContent,
                    '1'
                ).trim()
            );
        } catch(ex) {
            qty = 1;
            console.error(ex);
        }
        let price = '';
        try {
            const priceElem = <HTMLElement>util.findSingleNodeValue(
                './/span[contains(@class, "price")]//nobr',
                <HTMLElement>itemElem
            );
            price = util.defaulted(priceElem.textContent, '').trim();
        } catch(ex) {
            console.warn('could not find price for: ' + description);
        }
        const item = {
            description: description,
            url: url,
            price: price,
            order_id: order_id,
            quantity: qty
        } 
        return item
    });
    return items;
}
