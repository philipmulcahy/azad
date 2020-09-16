/* Copyright(c) 2020 Philip Mulcahy. */

"use strict";

(
    function(i,s,o,g,r,a,m) {
        i['GoogleAnalyticsObject'] = r;
        i[r] = i[r] || function() {
            ( i[r].q = i[r].q || [] ).push(arguments)
        }, i[r].l = (new Date()).getTime();
        a = s.createElement(o), m = s.getElementsByTagName(o)[0];
        a.async = 1;
        a.src = g;
        m.parentNode.insertBefore( a, m )
    }
)(
    window,
    document,
    'script',
    'https://www.google-analytics.com/analytics.js',
    'ga'
);

ga('create', 'UA-118834348-1', 'auto');

// Modifications:

// Disable file protocol checking.
ga('set', 'checkProtocolTask', null);

// Set page, avoiding rejection due to chrome-extension protocol
ga('send', 'pageview', '/popup');
