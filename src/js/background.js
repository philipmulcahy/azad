/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

const content_ports = {};
let control_port = null;
let advertised_years = [];

function registerConnectionListener() {
    chrome.runtime.onConnect.addListener( port => {
        console.log('new connection from ' + port.name);
        switch(port.name) {
            case 'azad_inject':
                port.onDisconnect.addListener( () => {
                    delete content_ports[port.sender.tab.id];
                } );
                port.onMessage.addListener( msg => {
                    switch(msg.action) {
                        case 'scrape_complete':
                            control_port.postMessage({
                                action: 'scrape_complete',
                                years: msg.years
                            });
                            break;
                        case 'advertise_years':
                            console.log('forwarding advertise_years', msg.years);
                            advertised_years = [
                                ...new Set(advertised_years.concat(msg.years))
                            ].sort();
                            advertiseYears();
                            break;
                        case 'statistics_update':
                            control_port.postMessage({
                                action: 'statistics_update',
                                statistics: msg.statistics
                            });
                            break;
                        case 'scraping_completed':
                            control_port.postMessage({
                                action: 'scraping_completed',
                                years: msg.years,
                            });
                            break;
                        default:
                            console.warn('unknown action: ' + msg.action);
                    }
                } );
                content_ports[port.sender.tab.id] = port;
                break;
            case 'azad_control':
                control_port = port;
                port.onMessage.addListener( msg => {
                    switch(msg.action) {
                        case 'scrape_years':
                            console.log('forwarding scrape_years', + msg.years);
                            Object.values(content_ports).forEach( port =>
                                port.postMessage({
                                    action: msg.action,
                                    years: msg.years
                                })
                            );
                            break;
                        case 'clear_cache':
                            Object.values(content_ports).forEach( port =>
                                port.postMessage({
                                    action: msg.action
                                })
                            );
                            break;
                        case 'abort':
                            Object.values(content_ports).forEach( port =>
                                port.postMessage({
                                    action: 'abort',
                                })
                            );
                            break;
                        default:
                            console.warn('unknown action: ' + msg.action);
                    }
                });
                advertiseYears();
                break;
            default:
                console.warn('unknown port name: ' + port.name);
        }
    });
}

function registerRightClickActions() {
    chrome.contextMenus.create( {
        id: 'save_order_debug_info',
        title: 'save order debug info',
        contexts: ['link']
    } );
    chrome.contextMenus.onClicked.addListener( info => {
        console.log('context menu item: ' + info.menuItemId + ' clicked;');
        if (info.menuItemId == 'save_order_debug_info') {
            if ( /orderID=/.test(info.linkUrl) ) {
                const match =info.linkUrl.match(/.*orderID=([0-9-]*)$/);
                const order_id = match[1];
                if (match) {
                    Object.values(content_ports).forEach( port => {
                        port.postMessage({
                            action: 'dump_order_detail',
                            order_detail_url: order_id
                        });
                    });
                }
            }
        }
    } );
}

function registerMessageListener() {
    chrome.runtime.onMessage.addListener( (request, sender) => {
        console.log(
            sender.tab
                ? 'from a content script:' + sender.tab.url
                : 'from the extension'
        );
        switch(request.action) {
            case 'open_tab':
                chrome.tabs.create( { url: request.url } );
                break;
            default:
                console.warn('unknown action: ' + request.action);
        }
    });
}

function advertiseYears() {
    if (control_port) {
        console.log('advertising years', advertised_years);
        control_port.postMessage({
            action: 'advertise_years',
            years: advertised_years
        });
    } else {
        console.log('cannot advertise years yet: no control port is set');
    }
}

registerConnectionListener();
registerRightClickActions();
registerMessageListener();
