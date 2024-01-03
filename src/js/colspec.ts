/* Copyright(c) 2024 Philip Mulcahy. */

import * as azad_entity from './entity';

export interface ColSpec {
  field_name: string;

  // Yes: using IEntity here means a tonne of downcasting in the
  // implementations. The alternatives seem (to me) worse.
  render_func?: (
    entity: azad_entity.IEntity, td: HTMLElement) => Promise<null|void>;

  is_numeric: boolean;
  value_promise_func_name?: string;
  help?: string;
  sites?: RegExp;
  visibility?: () => Promise<boolean>;
  sum?: number;
  pageSum?: number;
  hide_in_browser?: boolean;
}
