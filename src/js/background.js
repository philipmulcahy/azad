/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

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

registerListener();
