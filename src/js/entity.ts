/* Copyright(c) 2021 Philip Mulcahy. */

import * as azad_item from './item';
import * as azad_order from './order';

// Ugly abstraction used to lubricate extracting display data from business
// objects such as Orders and Items.
export interface IEntity {
};

export type Value = number|string|Date|azad_item.IItem[]|null;
export type Field = (()=>Promise<Value>)|Value;

function maybe_promise_to_promise(
    field: Field
): Promise<Value> {
    const called =
        typeof(field) === 'function' ?
            (field as ()=>Promise<Value>)() :
            field;
    if (called == null) {
        return Promise.resolve(null);
    } else if (typeof(called) === 'object' && 'then' in called) {
        return called;
    } else {
        return Promise.resolve(called);
    }
}

export function field_from_entity(
    entity: IEntity,
    field_name: string
): Field {
    function is_order(value: any): boolean {
      return 'item_list' in value;  // You may well sniff at this: type erasure
    }                               // has its moments.
    const value = is_order(entity) ?
        (entity as azad_order.IOrder)[field_name as keyof azad_order.IOrder] :
        (entity as azad_item.IItem)[field_name as keyof azad_item.IItem];
    if (is_order(value)) {
      throw field_name + "'s type is an Order, not a Value or Promise to Value";
    }
    const field = <Field>value;
    return field;
}
