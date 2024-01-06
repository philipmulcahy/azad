/* Copyright(c) 2024 Philip Mulcahy. */

const $ = require('jquery');
import * as colspec from './colspec';
import * as sprintf from 'sprintf-js';
import * as util from './util';

let datatable: any = null;

export function init(cols: Promise<colspec.ColSpec[]>) {
  datatable = (<any>$('#azad_order_table')).DataTable({
    'bPaginate': true,
    'lengthMenu': [
      [10, 25, 50, 100, -1],
      [10, 25, 50, 100, 'All'] ],
    'footerCallback': function() {
      const api = this.api();
      let col_index = 0;
      cols.then( cols => cols.forEach( col_spec => {
        const sum_col = function(col: any) {
          const data = col.data();
          if (data) {
            const sum = data
              .map( (v: string | number) => util.floatVal(v) )
              .reduce(
                (a: number, b: number) => a+b,
                0
              );
            return util.floatVal(sum);
          } else {
            return 0;
          }
        };
        if(col_spec.is_numeric) {
          col_spec.sum = sum_col(api.column(col_index));
          col_spec.pageSum = sum_col(
            api.column(col_index, {page: 'current'}));
            $(api.column(col_index).footer()).html(
              sprintf.sprintf(
                'page=%s; all=%s',
                col_spec.pageSum.toFixed(2),
                col_spec.sum.toFixed(2))
            );
        }
        col_index += 1;
      }));
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
