/* Copyright(c) 2019-2021 Philip Mulcahy. */

import * as azad_item from '../../js/item';
import * as azad_order from '../../js/order';
import * as statistics from '../../js/statistics';
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
        }

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

      const actual_string = JSON.stringify(actual_value).toLowerCase();
      const expected_string = JSON.stringify(expected_value).toLowerCase();

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

function byOrderId(orderId: string) {
  return (target: order_data.ITestTarget) => target.order_id == orderId;
}

async function runAllOrderTests():  Promise<ITestResult[]> {
  const targets = order_data.discoverTestData()
    // .filter(byOrderId('002-9651082-1715432'))  // @philipmulcahy amazon.com
    // .filter(byOrderId('026-5653597-4769168'))  // @philipmulcahy
    // .filter(byOrderId('111-0193776-6839441'))  // @ronindesign
    // .filter(byOrderId('111-2830238-7935455'))  // @arnie-lang
    // .filter(byOrderId('111-4563007-4720250'))  // aafayed (has search and replaced heavily for privacy - treat html with suspicion)
    // .filter(byOrderId('111-6654974-2451435'))  // aafayed
    // .filter(byOrderId('111-7327625-5652241'))  // @alfredoagg
    // .filter(byOrderId('112-1097135-4205023'))
    // .filter(byOrderId('112-4839511-0466649'))  // @arnie-lang
    // .filter(byOrderId('113-7976893-2567424'))  // @funlap
    // .filter(byOrderId('114-0199479-3410664'))
    // .filter(byOrderId('114-0571216-2380247'))  // @Sunshine-Oh-My
    // .filter(byOrderId('114-2140650-5679427'))
    // .filter(byOrderId('114-3539224-5901069'))
    // .filter(byOrderId('114-5123493-8741858'))  // Eric Corbin
    // .filter(byOrderId('202-0527784-8125937'))  // @philipmulcahy first dynamic html fetch of list_html
    // .filter(byOrderId('202-1048401-1481922'))  // @philipmulcahy
    // .filter(byOrderId('202-5402176-6145909'))  // Chris Lambert-Shiels #354 fired-and-forgotten 2025-09
    // .filter(byOrderId('202-7225797-3968301'))
    // .filter(byOrderId('203-3119409-7380334'))  // @philipmulcahy
    // .filter(byOrderId('203-5043319-1160320'))
    // .filter(byOrderId('203-5431933-7437105'))  // @philipmulcahy
    // .filter(byOrderId('203-6059583-9048313'))  // @philipmulcahy
    // .filter(byOrderId('204-1776211-0905112'))  // @philipmulcahy
    // .filter(byOrderId('205-1380848-8821960'),  // Chris Lambert-Shiels #353 fired-and-forgotten 2025-09
    // .filter(byOrderId('205-7528990-3423569'))
    // .filter(byOrderId('206-1563844-4321133'))
    // .filter(byOrderId('249-0382082-2380604'))  // @leyton01 amazon.com.au
    // .filter(byOrderId('302-1216490-4418760'))  // @Axelb1971 amazon.de
    .filter(byOrderId('304-9375309-0229108'))  // @Axelb1971 amazon.de
    // .filter(byOrderId('701-0109921-6873001'))  // @lstn amazon.ca
    // .filter(byOrderId('701-0324843-0325833'))  // @hadsie amazon.ca
    // .filter(byOrderId('701-6985978-3679428'))  // @belilan
    // .filter(byOrderId('702-0959775-1855435'))  // @freddyboy1974
    // .filter(byOrderId('702-7505549-3590660'))  // @belilan
    // .filter(byOrderId('D01-0566133-8319068'))  // @philipmulcahy
    // .filter(byOrderId('D01-1411651-9583045'))  // @philipmulcahy
    // .filter(byOrderId('D01-4607619-0755448'))  // @danniboy
    // .filter(byOrderId('D01-8755888-0539825'))
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
  process.stdout.write(`Counters:\n${statistics.Counters.stats.toString()}\n`);
  process.stdout.write(`Results:\n${JSON.stringify(results, null, 2)}\n`);
  process.stderr.write(`BadResults:\n${JSON.stringify(badResults)}\n`);
  process.exit(returnCode);
}

main();
