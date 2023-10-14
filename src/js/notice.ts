/* Copyright(c) 2020 Philip Mulcahy. */

function getBarContainer(doc: HTMLDocument): HTMLDivElement {
    const id = 'azad_notification_bar_container';
    const c: HTMLElement|null = doc.getElementById(id);
    if (c) {
        return <HTMLDivElement>c;
    }
    removeAnnoyingLink(doc);
    const new_c: HTMLDivElement = doc.createElement('div');
    new_c.setAttribute('id', id);
    doc.body.insertBefore(new_c, doc.body.firstElementChild);
    return new_c;
}

export function showNotificationBar(msg: string, doc: HTMLDocument):void {
    const container = getBarContainer(doc);
    const bar: HTMLDivElement = doc.createElement('div');
    container.insertBefore(bar, container.firstElementChild);
    bar.setAttribute('class', 'azad_notification_bar');

    const text: HTMLSpanElement = doc.createElement('span');
    bar.appendChild(text);
    text.textContent = msg;
    fadeAndDisappear(bar);
}

// The targetted link keeps climbing on top of the notification bar messages
// (and doesn't seem indispensable).
function removeAnnoyingLink(doc: HTMLDocument): void {
    const targets = doc.querySelectorAll('[class="skip-link"]');
    targets.forEach( target => target!.parentNode!.removeChild(target) );
}

function fadeAndDisappear(elem: HTMLElement) {
    let timeout: NodeJS.Timeout|null = null;

    const getT = function(){ return timeout; };
    const setT = function(t: NodeJS.Timeout|null){ timeout = t; };

    const clearT = function() {
        if(timeout) {
            clearTimeout(<NodeJS.Timeout>timeout); timeout = null
        }
    }

    const scheduleFadeAndDie = function(){
        setT(setTimeout( () => {
            elem.setAttribute('style', 'opacity:0.5;');
            setT(setTimeout( () => {
                 elem.setAttribute('style', 'opacity:0.2;');
                 setT(setTimeout( () => {
                     elem!.parentNode!.removeChild(elem);
                 }, 3000));
            }, 3000));
        }, 3000));
    };

    elem.addEventListener('mousemove', () => {
        clearT();
        elem.setAttribute('style', 'opacity:1;');
        scheduleFadeAndDie();
    });

    scheduleFadeAndDie();
}
