/* Copyright(c) 2019 Philip Mulcahy. */

'use strict';

const $ = require('jquery');

import * as settings from './settings';
import * as util from './util';
import * as git_hash from './git_hash';

$(document).ready(function() {
  $('body').on(
    'click',
    'a',
    function(event: Event) {
      const a: HTMLAnchorElement = event.currentTarget as HTMLAnchorElement;
      const href: string|null = a.getAttribute('href');
      if (typeof(href) != 'undefined') {
        chrome.tabs.create({url: href!});
      }
      return false;
    }
  );
});

function updateStateText(state_string: string) {
  console.log('updateStateText', state_string);
  $('#azad_state').text(state_string);
}

function activateIdle(): void {
  console.log('activateIdle');
  actionsShowOnly(['azad_clear_cache', 'azad_force_logout', 'azad_hide_controls']);
}

function activateScraping(years: number[]): void {
  console.log('activateScraping');
  actionsShowOnly(['azad_stop', 'azad_hide_controls']);
  try {
    updateStateText(
      'scraping ' + (Array.isArray(years) ? years.join(',') : years)
    );
  } catch (ex) {
    console.log('control.activateScraping blew up with: ', ex);
  }
}

function activateDone(purpose: string): void {
  console.log('activateDone');
  actionsShowOnly([
    'azad_clear_cache', 'azad_force_logout', 'azad_hide_controls'
  ]);
  updateStateText(purpose);
}

function actionsShowOnly(button_ids: string[]): void {
  $('.azad_action').addClass('hidden');
  button_ids.forEach( id => $('#' + id).removeClass('hidden') );
}

function showNormalPage(): void {
  pagesShowOnly(['azad_page_actions', 'azad_page_default']);
}

function showExtensionPay(): void {
  pagesShowOnly(['azad_page_actions', 'azad_page_extensionpay']);
}

function pagesShowOnly(button_ids: string[]): void {
  $('.azad_control_page').addClass('hidden');
  button_ids.forEach( id => $('#' + id).removeClass('hidden') );
}

let background_port: chrome.runtime.Port|null = null;
function connectToBackground() {
  console.log('connectToBackground');

  // @ts-ignore: tsc objects to null first parameter for connect();
  background_port = chrome.runtime.connect(null, { name: 'azad_control' });

  background_port.onMessage.addListener( msg => {
    switch(msg.action) {
      case 'advertise_periods':
        {
          console.info('control got periods advertisement');
          const periods = msg.periods;
          handleAdvertisePeriods(periods);
        }
        break;
      case 'statistics_update':
        console.info('control got statistics update');
        {
          const text = Object.entries(msg.statistics)
          .map(([k,v]) => {return k + ':' + v;})
          .join('; ');
          $('#azad_statistics').text(text);
          if (
            (
              msg.statistics.QUEUED_COUNT + msg.statistics.RUNNING_COUNT
            ) > 0
          ) {
            activateScraping(msg.purpose);
          } else {
            activateDone(msg.purpose);
          }
        }
        break;
      case 'authorisation_status':
        {
          console.info('control got authorisation_status message');
          const authorised = msg.authorisation_status;
          handleAuthorisationMessage(authorised);
        }
        break;
      default:
        console.warn('unknown action: ' + msg.action);
    }
  });

  background_port.postMessage(
    {action: 'check_feature_authorized', feature_id: 'premium_preview'});
}

async function handleAdvertisePeriods(periods: number[]): Promise<void> {
  const months = periods.filter(p => (p <= 12));
  const years = periods.filter(p => (p >= 2000));
  await showMonthsButtons(months);
  showYearButtons(years);
}

function handleAuthorisationMessage(authorised: boolean): void {
  const authorised_html = authorised ?
    'Preview/Premium features <b>enabled</b>' :
    'Preview/Premium features <b>disabled</b>';

  $('#azad_extensionpay_status').html(authorised_html);
}

function registerActionButtons() {
  try {
    $('#azad_clear_cache').on('click', () => {
      if (background_port) {
        console.log('clear cache clicked');
        background_port.postMessage({action: 'clear_cache'});
      } else {
        console.warn('clear cache clicked, but I have no background port');
      }
    });

    $('#azad_force_logout').on('click', () => {
      console.log('force logout clicked');
      if (background_port) {
        console.log('force logout clicked');
        background_port.postMessage({action: 'force_logout'});
      } else {
        console.warn('force logout clicked, but I have no background port');
      }
    });

    $('#azad_stop').on('click', () => {
      console.log('stop clicked');
      handleStopClick();
    });

    $('#azad_hide_controls').on('click', () => {
      console.log('closing popup');
      window.close();
    });

    $('#azad_payment_ui_button').on('click', () => {
      if (background_port) {
        console.log('show payment UI clicked');
        background_port.postMessage({action: 'show_payment_ui'});
      } else {
        console.warn('show payment UI clicked, but I have no background port');
      }
    });

    $('#azad_extpay_login_button').on('click', () => {
      if (background_port) {
        console.log('show payment UI clicked');
        background_port.postMessage({action: 'show_extpay_login_ui'});
      } else {
        console.warn('show extpay log-in UI clicked, but I have no background port');
      }
    });

    $('#azad_extpay_console_button').on('click', () => {
      if (background_port) {
        console.log('show extpay console clicked');
        background_port.postMessage({action: 'show_extpay_console'});
      } else {
        console.warn('show extpay console clicked, but I have no background port');
      }
    });
  } catch(ex) {
    console.warn('registerActionButtons caught: ' + ex);
  }
}

function registerPageButtons(): void {
  showNormalPage();
  $('#azad_switch_extensionpay').on('click', () => {
    showExtensionPay();
  });

  $('#azad_switch_default').on('click', () => {
    showNormalPage();
  });
}

function showYearButtons(years: number[]) {
  console.log('show year buttons', years);
  const got_some_years: boolean = years.length > 0;
  $('.azad_year_button').remove();
  maybeShowMissingYearsMessage(got_some_years);
  years.sort().reverse().forEach( year => {
    $('#azad_year_list').append(
      '<button class="azad_year_button" value="' + year + '">' + year + '</button>'
    );
  });
  $('.azad_year_button').on('click', handleYearClick);
}

function maybeShowMissingYearsMessage(gotSomeYears: boolean) {
  document
    .getElementById('azad_year_missing_message')!
    .innerHTML = gotSomeYears ?
      '' :
      '<span>No scrapeable years found. ' +
      'It is likely you don\'t have a tab open that ' +
      'can see your amazon orders or it hasn\'t had enough time to find the ' +
      'available years yet. ' +
      'It needs to be open on your chosen ' +
      'amazon country site, <b>and</b> logged in to your account.</span>' +
      '<br/>' +
      'See <a href="https://github.com/philipmulcahy/azad/issues/280">' +
      'this article</a> for more.';
}

async function showMonthsButtons(month_counts: number[]): Promise<void> {
  console.log('show month buttons', month_counts);
  $('.azad_months_button').remove();
  const classes = 'azad_months_button';
  console.log('showMonthButtons(...) classes = ' + classes);
  month_counts.sort().forEach( month_count => {
    $('#azad_year_list').append(
      '<button class="' + classes + '" value="' + month_count + '" >' +
      month_count + 'm</button>'
    );
  });
  console.log('showMonthButtons(...) buttons placed');
  $('.azad_months_button').on('click', handleMonthsClick);
  console.log('showMonthButtons(...) buttons wired up');
}

function handleYearClick(evt: { target: { value: any; }; }) {
  const year = evt.target.value;
  const years = [year];
  activateScraping(years);
  if (background_port) {
    console.log('sending scrape_years', year, 'message');
    try {
      background_port.postMessage({
        action: 'scrape_years',
        years: years,
      });
    } catch (ex) {
      console.log(ex);
    }
  } else {
    console.warn('background_port not set');
  }
}

function setVersion() {
  const elem = document.getElementById('azad_version');
  if (!elem) {
    return;
  }

  const text = git_hash.text();
  elem.textContent = text;
}

async function handleMonthsClick(evt: { target: { value: any; }; }) {
  const month_count = Number(evt.target.value);
  const end_date = new Date();
  const start_date = util.subtract_months(end_date, month_count);
  activateScraping([month_count]);
  if (background_port) {
    console.log('sending scrape_range', start_date, end_date, 'message');
    background_port.postMessage({
      action: 'scrape_range',
      start_date: start_date,
      end_date: end_date,
    });
  } else {
    console.warn('background_port not set');
  }
}

function handleStopClick() {
  if (background_port) {
    background_port.postMessage({action: 'abort'});
  }
  updateStateText('Scrape cancelled');
}

function init() {
  settings.startMonitoringSettingsStorage();
  settings.initialiseUi();
  settings.registerTableTypeRadioButtons();
  console.log('init');
  setVersion();
  activateIdle();
  connectToBackground();
  registerActionButtons();
  registerPageButtons();
}

$(document).ready( () => init() );
