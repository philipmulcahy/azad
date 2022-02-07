/* Copyright(c) 2021 Philip Mulcahy. */

export interface IEntity {
};

export type Value = number|string|Date|null;
export type Field = (()=>Promise<Value>)|Value;
