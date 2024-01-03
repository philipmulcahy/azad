/* Copyright(c) 2019, 2023 Philip Mulcahy. */

const $ = require('jquery');
import * as extraction from './extraction';
import * as ui_messages from  './ui_messages';

"use strict";

const EXTENSION_KEY = 'azad_settings';

function getSettings(entries: {[key: string]: any;} ): Record<string, any> {
  const encoded_settings = entries[EXTENSION_KEY];
  try{
    return JSON.parse(encoded_settings);
  } catch (ex) {
    console.error(
      'JSON.parse blew up with:' + ex +  ' while parsing: ' +
        encoded_settings
    );
    return {};
  }
}

function getElementsByKey(): Record<string, HTMLElement> {
  console.info('settings.getElementsByKey()');
  const key_to_elem: Record<string, HTMLElement> = {};
  const checkboxes = extraction.findMultipleNodeValues(
    '//table[@id="azad_settings"]//input',
    document.documentElement
  ).map( node => <HTMLElement>node );
  console.log('checkboxes: ', checkboxes);
  checkboxes.forEach( elem => {
    const key = elem.getAttribute('id');
    if (key) {
      key_to_elem[key] = elem;
    } else {
      console.warn('no id attribute found');
    }
  });
  console.info('settings.getElementsByKey() -> ', key_to_elem);
  return key_to_elem;
}

function reflow(elem: HTMLElement) {
  // force reflow and redraw
  void(elem.offsetHeight);
  // second attempt
  location.reload();
}

function updateElement(elem: HTMLElement, value: boolean) {
  console.info('settings.updateElem(...)');
  if (value) {
    elem.setAttribute('checked', 'true');
  } else {
    elem.removeAttribute('checked');
  }
  reflow(elem);
}

async function updateElements(
  elements: Record<string, HTMLElement>,
  values: Record<string, boolean>
): Promise<void> {
  console.info('settings.updateElements(...)');
  const preview_authorised = await getBoolean('preview_features_enabled');
  console.info('settings.updateElements(...) preview_authorised', preview_authorised);
  for ( const key of Object.keys(elements) ) {
    const value: boolean = (values && key in values) ?
      <boolean>values[key] :
      false;
    const elem = elements[key];
    if (elem) {
      console.info('settings.updateElements(...)', key, value);
      if (value) {
        elem.setAttribute('checked', 'true');
      } else {
        elem.removeAttribute('checked');
      }
      if (preview_authorised) {
        const parent = elem.parentElement;
        let parent_classes = parent!.getAttribute('class');
        console.info('settings.updateElements(...) classes for', key, ':', parent_classes);
        if (parent_classes) {
          parent_classes = parent_classes.replace('azad_disabled', '').trim();
          console.info('settings.updateElements(...) new classes for', key, ':', parent_classes);
          if (parent_classes.length) {
            parent!.setAttribute('class', parent_classes);
            console.info('settings.updateElements(...) setting class');
          } else {
            parent!.removeAttribute('class');
            console.info('settings.updateElements(...) removing class');
          }
        }
      }
    }
  }
  return;
}

async function setCheckboxElemClickHandlers(
  key_to_elem: Record<string, HTMLElement>
): Promise<void> {
  console.info('settings.setCheckboxElemClickHandlers() starting');
  for( const key of Object.keys(key_to_elem) ) {
    const elem = key_to_elem[key];
    if (elem) {
      elem.onclick = async function() {
        let value: boolean = await getBoolean(key);
        value = value ? false : true;
        if (elem.parentElement
                ?.getAttribute('class')
                ?.includes('azad_disabled'))
        {
          const preview_authorised = await getBoolean(
            'preview_features_enabled');
          if (!preview_authorised) {
            alert(ui_messages.preview_feature_disabled);
            value = false;
          }
        }
        storeBoolean(key, value);
        if (elem) {
          updateElement(elem, value);
        }
      };
    }
  }
}

export async function registerTableTypeRadioButtons() {
  const SETTINGS_KEY = 'azad_table_type';

  // Make sure that a table type is set.
  let initial_table_type = await getString(SETTINGS_KEY);
  if (!['orders', 'items', 'shipments'].includes(initial_table_type)) {
    initial_table_type = 'orders';
    await storeString(SETTINGS_KEY, initial_table_type);
  }

  // Set up checked state from settings.
  Array.from(document.getElementsByClassName('azad_table_type')).forEach(
    (elem: Element) => {
      const id = elem.getAttribute('id');
      console.log('for azad_table_type got', initial_table_type);
      if ('azad_show_' + initial_table_type == elem.getAttribute('id') ) {
        elem.setAttribute('checked', 'checked');
      }
    }
  );

  async function radio_button_click_handler(evt: Event) {
    try {
      const preview_authorised = await getBoolean('preview_features_enabled');
      const clicked = evt.target as Element;
      const target_id = clicked.getAttribute('id');
      const table_type = clicked.getAttribute('id')!.replace('azad_show_', '');
      const target_class = clicked.getAttribute('class');
      const azad_disabled = target_class!.includes('azad_disabled');
      if (azad_disabled) {
        if (preview_authorised) {
          // They'll be confused if they get a table with no columns.
          await storeBoolean('show_shipment_info', true);
        } else {
          setTimeout(
            () => {
              alert(ui_messages.preview_feature_disabled);
              const default_button = document.getElementById(
                'azad_show_orders');
              default_button?.dispatchEvent(new Event('click'));
            },
            100,
          );
          throw 'feature disabled';
        }
      }
      setTimeout(()=>clicked.setAttribute('checked', 'checked'), 10);
      await storeString(SETTINGS_KEY, table_type);
    } catch (ex) {
      console.warn('failed during handling table type radio button event', ex);
    }
  }

  // Set up click listeners.
  const radio_buttons = Array.from(
    document.getElementsByClassName('azad_table_type'))
  radio_buttons.forEach(
    btn => btn.addEventListener(
      'click',
      radio_button_click_handler
    )
  );
}

export function initialiseUi(): Promise<void> {
  console.info('settings.initialiseUi() starting');
  return new Promise<void>( function( resolve ) {
    chrome.storage.sync.get(
      EXTENSION_KEY,
      async function(entries) {
        const settings = getSettings(entries);
        const key_to_elem: Record<string, HTMLElement> = getElementsByKey();
        await updateElements(key_to_elem, settings);
        setCheckboxElemClickHandlers(key_to_elem);
        resolve();
      }
    );
  });
}

export function storeBoolean(key: string, value: boolean): Promise<void> {
  return store<boolean>(key, value);
}

export function storeString(key: string, value: string): Promise<void> {
  return store<string>(key, value);
}

function store<T>(key: string, value: T): Promise<void> {
  return new Promise<void>( function( resolve, reject ) {
    chrome.storage.sync.get(
      EXTENSION_KEY,
      function(entries) {
        const settings = getSettings(entries);
        settings[key] = value;
        const stringified_settings =  JSON.stringify(settings);
        const updated_entry: Record<string, string> = {};
        updated_entry[EXTENSION_KEY] = stringified_settings;
        chrome.storage.sync.set(
          updated_entry,
          function() {
            if (chrome.runtime.lastError) {
              const msg = 'settings (maybe) not written: ' +
                chrome.runtime.lastError.message;
              console.warn(msg);
              reject(msg);
            } else {
              console.info('settings written:', updated_entry);
              resolve();
            }
          }
        );
      }
    );
  });
}

export function getBoolean(key: string): Promise<boolean> {
  return get<boolean>(key);
}

export function getString(key: string): Promise<string> {
  return get<string>(key);
}

export function get<T>(key: string): Promise<T> {
  return new Promise<T>( function( resolve ) {
    chrome.storage.sync.get(
      EXTENSION_KEY,
      function(entries) {
        const settings = getSettings(entries);
        const any_value = settings[key];
        const value = <T>any_value;
        resolve(value);
      }
    );
  });
}

export function startMonitoringSettingsStorage() {
  console.info('settings.startMonitoringSettingsStorage');
  chrome.storage.onChanged.addListener((changes, area) => {
    console.info('settings storage changed: ', area, changes);
  });
}
