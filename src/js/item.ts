/* Copyright(c) 2017-2021 Philip Mulcahy. */

import * as util from './util';

export interface IItem {
    description(): string;
    url(): string;
    price():string;
}

export type Items = Record<string, string>;

export function getItems(elem: HTMLElement): Items {
        /*
          <a class="a-link-normal" href="/gp/product/B01NAE8AW4/ref=oh_aui_d_detailpage_o01_?ie=UTF8&amp;psc=1">
              The Rise and Fall of D.O.D.O.
          </a>
          or
          <a class="a-link-normal" href="/gp/product/B06X9BZNDM/ref=oh_aui_d_detailpage_o00_?ie=UTF8&amp;psc=1">
              Provenance
          </a>
          but a-link-normal is more common than this, so we need to match on gp/product
          like this: .//div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]
          then we get:
              name from contained text
              link from href attribute
              item: not sure what we use this for - will it still work?
        */
        const itemResult: Node[] = util.findMultipleNodeValues(
// Note, some items don't have title= links, and some don't have links which contain '/gp/product/'. See D01-9406277-3414619. Confirming "a-row" seems to be enough.
//                './/div[@class="a-row"]/a[@class="a-link-normal"][contains(@href,"/gp/product/")]',
            './/div[@class="a-row"]/a[@class="a-link-normal"]',
            elem
        );
        const items: Items = {};
    itemResult.forEach(
        (node: Node) => {
            const item: HTMLElement = <HTMLElement>node;
            const name = item.innerHTML
                             .replace(/[\n\r]/g, " ")
                             .replace(/  */g, " ")
                             .replace(/&amp;/g, "&")
                             .replace(/&nbsp;/g, " ")
                             .trim();
            const link = util.defaulted(item.getAttribute('href'), '');
            items[name] = link;
        }
    );
    return items;
};

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
