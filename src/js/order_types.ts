/* Copyright(c) 2017-2022 Philip Mulcahy. */

import * as azad_entity from './entity';
import * as item from './item';

'use strict';

export interface IOrder extends azad_entity.IEntity {
    id(): Promise<string>;
    detail_url(): Promise<string>;
    invoice_url(): Promise<string>;

    date(): Promise<Date|null>;
    gift(): Promise<string>;
    gst(): Promise<string>;
    item_list(): Promise<item.IItem[]>;
    items(): Promise<item.Items>;
    payments(): Promise<any>;
    postage(): Promise<string>;
    postage_refund(): Promise<string>;
    pst(): Promise<string>;
    refund(): Promise<string>;
    site(): Promise<string>;
    total(): Promise<string>;
    us_tax(): Promise<string>;
    vat(): Promise<string>;
    who(): Promise<string>;

    assembleDiagnostics(): Promise<Record<string,any>>;
    date_direct(): Date|null;
    id_direct(): string;
    detail_url_direct(): string;
};

export interface IOrderDetails {
    date: Date|null;
    total: string;
    postage: string;
    postage_refund: string;
    gift: string;
    us_tax: string;
    vat: string;
    gst: string;
    pst: string;
    refund: string;
    who: string;
    invoice_url: string;

    [index: string]: string|Date|null;
};

