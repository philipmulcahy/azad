/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */


function registerPopups() {
    chrome.contextMenus.create(
        {
            id: 'save_order_debug_info',
            title: 'save order debug info',
            contexts: ['link']
//            onclick: () => console.log('save order debug info clicked')
        }
    );
    chrome.contextMenus.onClicked.addListener(info => {
        console.log('context menu item: ' + info.menuItemId + ' clicked;');
    });
}

function registerListener() {
    "use strict";
    chrome.runtime.onMessage.addListener( (request, sender, sendResponse) => {
        console.log(
            sender.tab
                ? 'from a content script:' + sender.tab.url
                : 'from the extension'
        );
        if (request.action == 'open_tab') {
            chrome.tabs.create(
                { url: request.url }
            );
        }
    });
}

registerPopups();
registerListener();
