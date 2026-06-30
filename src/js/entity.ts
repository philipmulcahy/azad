/* Copyright(c) 2021-2026 Philip Mulcahy. */

import * as azad_item from './item';
import * as azad_order from './order';

// Ugly abstraction used to lubricate extracting display data from business
// objects such as Orders and Items.
export interface IEntity {}

export type Value = number|string|Date|azad_item.IItem[]|null;
export type Field = (()=>Promise<Value>)|Value;

export function field_from_entity(
    entity: IEntity,
    field_name: string
): Field {
    function is_order(value: unknown): value is { item_list: unknown } {
      // We check if value is a non-null object, then safely look for the key
      return typeof value === 'object' && value !== null && 'item_list' in value;
    }

    const value = is_order(entity) ?
        (entity as azad_order.IOrder)[field_name as keyof azad_order.IOrder] :
        (entity as azad_item.IItem)[field_name as keyof azad_item.IItem];
    if (is_order(value)) {
      throw field_name + "'s type is an Order, not a Value or Promise to Value";
    }
    const field = <Field>value;
    return field;
}
