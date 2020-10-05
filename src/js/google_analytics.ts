/* Copyright(c) 2020 Philip Mulcahy. */

"use strict";

export var gaNewElem : any = {};
export var gaElems : any = {};

export function init(): void {
    console.log('initialising google analytics support');

    var currdate : any = new Date();
  
    /* tslint:disable:no-string-literal */
    /* tslint:disable:semicolon */
    /* tslint:disable:no-unused-expression */

    // This code is from Google, so let's not modify it too much,
    // just add gaNewElem and gaElems:

    // @ts-ignore: there are too many crimes being committed here...
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
    // @ts-ignore: there are too many crimes being committed here...
    (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*currdate;a=s.createElement(o),
    // @ts-ignore: there are too many crimes being committed here...
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    // @ts-ignore: there are too many crimes being committed here...
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga', gaNewElem, gaElems);
    /* tslint:enable:no-unused-expression */
    /* tslint:enable:semicolon */
    /* tslint:enable:no-string-literal */


    // @ts-ignore: there are too many crimes being committed here...
    ga('create', 'UA-118834348-1', 'auto');

    // Modifications:

    // Disable file protocol checking.
    // @ts-ignore: there are too many crimes being committed here...
    ga('set', 'checkProtocolTask', null);

    // Set page, avoiding rejection due to chrome-extension protocol
    // @ts-ignore: there are too many crimes being committed here...
    ga('send', 'pageview', '/popup');
}
