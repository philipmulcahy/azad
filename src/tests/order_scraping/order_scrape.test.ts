/* Copyright(c) 2019-2021 Philip Mulcahy. */

import * as azad_item from '../../js/item';
import * as azad_order from '../../js/order';
import {dateToDateIsoString} from '../../js/date';
import * as fs from 'fs';
import * as order_data from '../fake_order';
const process = require('process');
import * as util from '../../js/util';

interface ITestResult {
  test_id: string;
  passed: boolean;
  defects: string[];
}


async function testOneOrderTarget(
    target: order_data.ITestTarget
): Promise<ITestResult> {
  const result: ITestResult = {
    test_id: 'ORDER_SCRAPE_' +
             target.site + '_' +
             target.order_id + '_' +
             target.scrape_date,
    passed: false,
    defects: [],
  };

  console.log('testing:', target.site, target.order_id);

  const maybe_order: azad_order.IOrder | null = order_data.orderFromTestData(
    target.order_id,
    target.scrape_date,
    target.site
  );

  if (maybe_order == null ) {
    return Promise.reject('could not create order');
  }

  const order = maybe_order as azad_order.IOrder;

  // 2023-07 reinstate legacy items property.
  (order as any)['items'] = () => azad_order.get_legacy_items(order);

  const expected = order_data.expectedFromTestData(
    target.order_id,
    target.scrape_date,
    target.site
  );

  const keys = Object.keys(expected);

  async function validateKey(key: string): Promise<void> {
    try {
      let expected_value = util.defaulted(expected[key], '');
      const actual_value_promise = (order as Record<string, any>)[key]();
      let actual_value = await actual_value_promise;
      console.log('key:', key, expected_value, actual_value);

      if ( key.toLowerCase().includes('date') ) {
        actual_value = dateToDateIsoString(actual_value as Date);
      }

      if ( key == 'item_list' ) {
        function strip_uninteresting_fields (
          item_list: azad_item.IItem[]
        ): azad_item.IItem[] {
          item_list.forEach( item => {
            [
              'order_date', 'order_id', 'order_detail_url', 'order_header'
            ].forEach( key => { delete (item as any)[key]; } );
          });
          return item_list;
        };

        expected_value = strip_uninteresting_fields(
          expected_value as azad_item.IItem[]
        );

        actual_value = strip_uninteresting_fields(
          actual_value as azad_item.IItem[]
        );
      }
      if ( key == 'shipments' ) {
        actual_value.forEach( (shipment: any) =>
          shipment.items.forEach(
            (item: any) => { delete item.order_header; }
          )
        );
      }

      const actual_string = JSON.stringify(actual_value);
      const expected_string = JSON.stringify(expected_value);

      if ( actual_string != expected_string ) {
        const msg = key + ' should be ' + expected_string +
          ' but we got ' + actual_string;

        result.defects.push(msg);
      }
    } catch(ex) {
      console.error(ex!.toString());
      result.defects.push(`${key}: ${ex!.toString()}`);
    }
  }

  const key_validation_promises = keys.map(validateKey); 

  return Promise.all(key_validation_promises).then( () => {
    if (result.defects.length == 0) {
      result.passed = true;
    }

    return result;
  });
}

async function runAllOrderTests():  Promise<ITestResult[]> {
  const targets = order_data.discoverTestData()
      // .filter(target => target.order_id == '002-9651082-1715432')  // @philipmulcahy amazon.com
      // .filter(target => target.order_id == '026-5653597-4769168')  // @philipmulcahy
      // .filter(target => target.order_id == '202-5402176-6145909')  // chris-lambert-shiels
      // .filter(target => target.order_id == '111-0193776-6839441')  // @ronindesign
      // .filter(target => target.order_id == '112-1097135-4205023')
      // .filter(target => target.order_id == '111-7327625-5652241')  // @alfredoagg
      // .filter(target => target.order_id == '702-7505549-3590660')  // @belilan
      // .filter(target => target.order_id == '111-2830238-7935455')  // @arnie-lang
      // .filter(target => target.order_id == '112-4839511-0466649')  // @arnie-lang
      // .filter(target => target.order_id == '113-7976893-2567424')  // @funlap
      // .filter(target => target.order_id == '114-0199479-3410664')
      // .filter(target => target.order_id == '205-1380848-8821960')  // chris-lambert-shiels
      // .filter(target => target.order_id == '114-0571216-2380247')  // @Sunshine-Oh-My
      // .filter(target => target.order_id == '114-2140650-5679427')
      // .filter(target => target.order_id == '114-3539224-5901069')
      // .filter(target => target.order_id == '114-5123493-8741858')  // Eric Corbin
      // .filter(target => target.order_id == '202-1048401-1481922')  // @philipmulcahy
      // .filter(target => target.order_id == '202-0527784-8125937')  // @philipmulcahy first dynamic html fetch of list_html
      // .filter(target => target.order_id == '202-7225797-3968301')
      // .filter(target => target.order_id == '203-3119409-7380334')  // @philipmulcahy
      // .filter(target => target.order_id == '203-5431933-7437105')  // @philipmulcahy
      // .filter(target => target.order_id == '203-6059583-9048313')  // @philipmulcahy
      // .filter(target => target.order_id == '203-5043319-1160320')
      // .filter(target => target.order_id == '205-7528990-3423569')
      // .filter(target => target.order_id == '206-1563844-4321133')
      // .filter(target => target.order_id == '701-0109921-6873001')  // @lstn
      // .filter(target => target.order_id == '701-6985978-3679428')  // @belilan
      // .filter(target => target.order_id == 'D01-4607619-0755448')  // @danniboy
      // .filter(target => target.order_id == 'D01-1411651-9583045')  // @philipmulcahy
      // .filter(target => target.order_id == 'D01-8755888-0539825')
  ;

  const results_promises = targets.map(testOneOrderTarget);
  const results = await Promise.all(results_promises);
  return results;
}

async function main() {
  const results = await runAllOrderTests();
  const badResults = results.filter(r => (!r.passed) || (r.defects.length != 0));
  const badOrderCount = badResults.length;
  const defectCount = badResults.map(r => r.defects).flat().length;
  const returnCode = Math.max(badOrderCount, defectCount);
  process.stdout.write(JSON.stringify(results, null, 2));
  process.stderr.write(JSON.stringify(badResults));
  process.exit(returnCode);
}

main();
