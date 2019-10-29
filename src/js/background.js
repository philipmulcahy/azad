/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

const diagnostics_dumpers = {};

function listenForOrderDiagnosticDumpers() {
    chrome.runtime.onConnect.addListener( port => {
        port.onDisconnect.addListener( () => {
            delete diagnostics_dumpers[port.sender.tab.id];
        } );
        diagnostics_dumpers[port.sender.tab.id] = 
            order_detail_url => port.postMessage({order_detail_url: order_detail_url});
    });
}

function registerRightClickActions() {
    chrome.contextMenus.create(
        {
            id: 'azad_save_order_debug_info',
            title: 'AZAD save order debug info',
            contexts: ['link']
        }
    );
    chrome.contextMenus.onClicked.addListener(info => {
        console.log('context menu item: ' + info.menuItemId + ' clicked;');
        if (info.menuItemId == 'azad_save_order_debug_info') {
            if ( /orderID=/.test(info.linkUrl) ) {
                const match =info.linkUrl.match(/.*orderID=([0-9-]*)$/);
                if (match) {
                    const order_id = match[1];
                    Object.values(diagnostics_dumpers).forEach( dumper => dumper(order_id) );
                }
            }
        }
    });
}

function registerNewTabListener() {
    "use strict";
    chrome.runtime.onMessage.addListener( (request, sender) => {
        console.log(
            sender.tab
                ? 'from a content script:' + sender.tab.url
                : 'from the extension'
        );
        if (request.action == 'open_tab') {
            chrome.tabs.create(
                { url: request.url }
            );
        } else {
            console.warn('unknown action: ' + request.action);
        }
    });
}

listenForOrderDiagnosticDumpers();
registerRightClickActions();
registerNewTabListener();
