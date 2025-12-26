/* Copyright(c) 2023 Philip Mulcahy. */

type ControlPortMessagePeriods = {
    action: string;
    years: number[];
}

type ControlPortMessageAuth = {
    action: string;
    authorisation_status: boolean;
}

export type ControlPortMessage = ControlPortMessagePeriods | ControlPortMessageAuth;

export interface ControlPort {
    postMessage: (msg: ControlPortMessage) => void;
}
