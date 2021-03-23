/* Copyright(c) 2021 Philip Mulcahy. */

export interface IEntity {
};

export type Value = number|string;
export type Field = (()=>Promise<Value>)|Value;
