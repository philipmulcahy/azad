import * as fs from 'fs';
const jsdom = require('jsdom');
import * as periods from '../../js/periods';

function testOneGetYearsTarget(name: string) {
  const filePath = `./src/tests/azad_test_data/get_years/${name}.html`;

  const html_text = fs.readFileSync(filePath, 'utf8');
  const doc = new jsdom.JSDOM(html_text).window.document;
  const years: number[] = periods.get_years(doc);

  const result = {
    test_id: 'GET_YEAR_NUMBERS_' + filePath,
    years,
    passed: years.length > 5 && years.length < 25,
  };

  if (!result.passed) {
    console.log(result);
  }

  expect(result.passed).toEqual(true);
}

describe(
  'discover available year numbers from several users canned html files',
  () => {
    for (const name of [
     'NathanChristie_2023-09-08',
     'PhilipMulcahy_2023-09-09',
     'shood_2023-09-08',
     'WatersPaul_2025-01-14',
     'WatersPaul_2025-01-16',

      // Q: why is this test row disabled?
      // A: the html file doesn't appear to have any four digit year literals
      //    in it anywhere. The period selector/picker only has 'Last 30 days'
      //    and 'Last 3 months'.
      // Q: Why didn't it fail before you migrated it to jest?
      // A: I don't know.
      // 'WatersPaul_2025-01-22',
    ]) {
      test(name, () => {
         testOneGetYearsTarget(name);
      });
    }
  }
);
