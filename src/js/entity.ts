/* Copyright(c) 2021 Philip Mulcahy. */

import * as item from './item';

export interface IEntity {
};

export type Value = number|string|Date|null|item.IItem[]|string[];
export type Field = (()=>Promise<Value>)|Value;
