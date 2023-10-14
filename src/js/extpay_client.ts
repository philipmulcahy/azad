/* Copyright(c) 2023 Philip Mulcahy. */

'use strict';

const ep = require('extpay');

// Apparently (https://github.com/glench/ExtPay#manifest-v3)
// we should fetch a new ExtPay reference each time we need one (for async code)
// but only initialise once with startBackground.
function getExtPay(): any {
  return ep.default('amazon-order-history-reporter-premium-annual');
}

try {
  getExtPay().startBackground();
  console.log('extpay initialised');
} catch (ex) {
  console.error('extpay_client got ' + ex + ' when calling startBackground');
}

export async function check_authorised(): Promise<boolean> {
  console.log('extpay_client.check_authorised() called');
  const user = await getExtPay().getUser();

  // Sometimes subscriptionStatus is undefined - this seems to be triggered by
  // the use of more than one version of the extension, and so far I've not
  // found a way of un-doing the damage.
  const status = user.subscriptionStatus;

  const authorised = status == 'active' || user.paid;
  return authorised;
}

export async function display_payment_ui() {
  getExtPay().openPaymentPage();
}

export async function display_login_page() {
  getExtPay().openLoginPage();
}
