/* Copyright(c) 2018 Philip Mulcahy. */
/* jshint strict: true, esversion: 6 */

'use strict';

const content_ports: Record<number, any> = {};

let control_port: {
    postMessage: (arg0: { action: string; years: number[]; }) => void;
} | null = null;

let advertised_years: number[] = [];

function registerConnectionListener() {
    chrome.runtime.onConnect.addListener( port => {
        console.log('new connection from ' + port.name);
        switch(port.name) {
            case 'azad_inject':
                port.onDisconnect.addListener( () => {
                    delete content_ports[port?.sender?.tab?.id!];
                } );
                port.onMessage.addListener( msg => {
                    switch(msg.action) {
                        case 'scrape_complete':
                            control_port!.postMessage(msg);
                            break;
                        case 'advertise_years':
                            console.log(
                                'forwarding advertise_years',
                                msg.years
                            );
                            advertised_years = [
                                ...Array.from(new Set<number>(
                                    advertised_years.concat(msg.years))
                                )
                            ].sort();
                            advertiseYears();
                            break;
                        case 'statistics_update':
                          if (control_port) {
                            try {
                              control_port!.postMessage(msg);
                            } catch (ex) {
                              console.debug(
                                'could not post stats message to control port'
                              );
                            }
                          }
                          break;
                        default:
                            console.warn('unknown action: ' + msg.action);
                            break;
                    }
                } );
                content_ports[port?.sender?.tab?.id!] = port;
                break;
            case 'azad_control':
                control_port = port;
                port.onMessage.addListener( msg => {
                    switch(msg.action) {
                        case 'scrape_years':
                            console.log(
                                'forwarding scrape_years',
                                msg.years
                            );
                            Object.values(content_ports).forEach( port =>
                                port.postMessage(msg)
                            );
                            break;
                        case 'clear_cache':
                            Object.values(content_ports).forEach( port =>
                                port.postMessage(msg)
                            );
                            break;
                        case 'force_logout':
                            Object.values(content_ports).forEach( port =>
                                port.postMessage(msg)
                            );
                            break;
                        case 'abort':
                            Object.values(content_ports).forEach( port =>
                                port.postMessage(msg)
                            );
                            break;
                        default:
                            console.warn('unknown action: ' + msg.action);
                            break;
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
            if ( /orderID=/.test(info.linkUrl!) ) {
                const match =info?.linkUrl?.match(/.*orderID=([0-9A-Z-]*)$/);
                const order_id = match![1];
                if (match) {
                    Object.values(content_ports).forEach( port => {
                        port.postMessage({
                            action: 'dump_order_detail',
                            order_id: order_id
                        });
                    });
                }
            }
            else if ( /search=/.test(info.linkUrl!) ) {
                const match =info?.linkUrl?.match(/.*search=([0-9A-Z-]*)$/);
                const order_id = match![1];
                if (match) {
                    Object.values(content_ports).forEach( port => {
                        port.postMessage({
                            action: 'dump_order_detail',
                            order_id: order_id
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
            case 'remove_cookie':
                chrome.cookies.remove(
                    {
                        url: request.cookie_url,
                        name: request.cookie_name
                    },
                    () => console.log(
                        'removed cookie ' + request.cookie_url + ' ' +
                        request.cookie_name
                    )
                )
                break;
            case 'open_tab':
                console.log('opening: ' + request.url);
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
