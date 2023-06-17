/* Copyright(c) 2019, 2023 Philip Mulcahy. */

import * as util from './util';
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
  const checkboxes = util.findMultipleNodeValues(
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

function updateElement(elem: HTMLElement, value: boolean) {
  console.info('settings.updateElem(...)');
  if (value) {
    elem.setAttribute('checked', 'true');
  } else {
    elem.removeAttribute('checked');
  }
}

async function updateElements(
  elements: Record<string, HTMLElement>,
  values: Record<string, boolean>
): Promise<void> {
  console.info('settings.updateElements(...)');
  const preview_authorised = await getBoolean('preview_features_enabled');
  console.info('settings.updateElements(...) preview_authorised', preview_authorised);
  for ( let key of Object.keys(elements) ) {
    let value: boolean = (values && key in values)  ?
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
        let parent_classes = parent!.getAttribute('class')
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
  };
  return;
}

async function setElemClickHandlers(key_to_elem: Record<string, HTMLElement>): Promise<void> {
  console.info('settings.setElemClickHandlers() starting');
  const preview_authorised = await getBoolean('preview_features_enabled');
  for( let key of Object.keys(key_to_elem) ) {
    const elem = key_to_elem[key];
    if (elem) {
      elem.onclick = async function() {
        let value: boolean = await getBoolean(key);
        value = value ? false : true;
        storeBoolean(key, value);
        if (elem) {
          updateElement(elem, value);
        }
        if (!preview_authorised) {
          alert(ui_messages.preview_feature_disabled);
        }
      };
    }
  };
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
        setElemClickHandlers(key_to_elem);
        resolve();
      }
    );
  });
}

export function storeBoolean(key: string, value: boolean): Promise<void> {
  return new Promise<void>( function( resolve, reject ) {
    chrome.storage.sync.get(
      EXTENSION_KEY,
      function(entries) {
        const settings = getSettings(entries);
        settings[key] = value;
        const stringified_settings =  JSON.stringify(settings);
        const updated_entry: Record<string, string> = {}
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
    )
  });
}

export function getBoolean(key: string): Promise<boolean> {
  return new Promise<boolean>( function( resolve ) {
    chrome.storage.sync.get(
      EXTENSION_KEY,
      function(entries) {
        const settings = getSettings(entries);
        const any_value = settings[key];
        const value = <boolean>any_value;
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
