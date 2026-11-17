/* Copyright(c) 2024 Philip Mulcahy. */

import $ from 'jquery';
import 'datatables.net';
import * as colspec from './colspec';
import * as util from './util';

interface IDataTableInstance {
  rows: () => { invalidate: () => void };
  draw: () => void;
  destroy: () => void;
}

let datatable: IDataTableInstance | null = null;

export function init(cols: Promise<colspec.ColSpec[]>) {
  const tableElement = $('#azad_order_table') as unknown as { DataTable: (config: unknown) => IDataTableInstance };

  datatable = tableElement.DataTable({
    'bPaginate': true,
    'lengthMenu': [
      [10, 25, 50, 100, -1],
      [10, 25, 50, 100, 'All'] ],
    'footerCallback': function(this: { api: () => unknown }) {
      const api = this.api() as {
        column: (idx: number, options?: unknown) => {
          data: () => (string | number)[];
          footer: () => unknown;
        };
      };
      void cols.then(specs => {
        const selected = specs.map((spec, idx) => ({spec, idx})).filter(
          entry => entry.spec.is_numeric && /^(total|shipping|tax|refund|FSA\/HSA amount|FSA amount)$/i.test(entry.spec.field_name)
        );
        const sum = (values: (string | number)[]): number =>
          values.reduce<number>((acc, value) => acc + util.floatVal(value), 0);
        const metrics = selected.map(({spec, idx}) => {
          const all = sum(api.column(idx, {search: 'applied'}).data());
          const page = sum(api.column(idx, {page: 'current'}).data());
          spec.sum = all;
          spec.pageSum = page;
          return {label: spec.field_name, all, page};
        });
        let panel = document.getElementById('azad_totals_summary');
        if (!panel) {
          panel = document.createElement('section');
          panel.id = 'azad_totals_summary';
          const anchor = document.querySelector('#azad_order_table_wrapper') ||
            document.getElementById('azad_order_table');
          anchor?.parentNode?.insertBefore(panel, anchor);
        }
        panel.replaceChildren();
        const heading = document.createElement('strong');
        heading.textContent = 'Totals';
        panel.appendChild(heading);
        const hint = document.createElement('span');
        hint.textContent = 'Page / All matching rows';
        hint.className = 'azad_totals_hint';
        panel.appendChild(hint);
        const grid = document.createElement('div');
        grid.className = 'azad_totals_grid';
        metrics.forEach(metric => {
          const cell = document.createElement('div');
          cell.className = 'azad_total_metric';
          const name = document.createElement('span');
          name.textContent = metric.label;
          const amount = document.createElement('b');
          const money = (value: number) => '$' + value.toFixed(2);
          amount.textContent = money(metric.page) + ' / ' + money(metric.all);
          cell.appendChild(name);
          cell.appendChild(amount);
          grid.appendChild(cell);
        });
        panel.appendChild(grid);
      });
    }
  });
}

export function invalidate() {
  if(datatable) {
    datatable.rows().invalidate();
    datatable.draw();
  }
}

export function destroy() {
  if (datatable) {
    datatable.destroy();
  }
}
