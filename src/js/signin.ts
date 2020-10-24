/* Copyright(c) 2020 Philip Mulcahy. */

const MIN_ALERT_REPEAT_INTERVAL_S = 30; 

let alerts_enabled: boolean = true;

function rateLimitedAlert(msg: string):void {
    if (alerts_enabled) {
        alerts_enabled = false;
        setTimeout(
            () => {
                alerts_enabled = true;
            },
            MIN_ALERT_REPEAT_INTERVAL_S * 1000
        );
        window.alert(msg);
    }
}

function checkSigninRedirect(
    response: Response,
    original_url: string
): void {
    if (response.redirected && response.url.includes('signin')) {
        const msg = 'Got status:' + response.status +
                    ' while fetching ' + original_url +
                    ' \nThis might be because you are not fully' +
                    ' logged in to Amazon.';
        console.warn(msg);
        rateLimitedAlert(msg);
        throw msg;
    }
}

export function checkedFetch(url: string): Promise<Response> {
    return fetch(url).then( 
        (response: Response) => {
            checkSigninRedirect( response, url );
            return response;
        },
        err => {
            const msg = 'Got error while fetching debug data for: ' + url + ' ' + err;
            console.warn(msg);
            throw err;
        }
    );
}

export function alertPartiallyLoggedOutAndOpenLoginTab(url: string): void {
    window.alert(
        'Amazon Order History Reporter Chrome Extension\n\n' +
        'It looks like you might have been logged out of Amazon.\n' +
        'Sometimes this can be "partial" - some types of order info stay ' +
        'logged in and some do not.\n' +
        'I will now attempt to open a new tab with a login prompt. Please ' +
        'use it to login,\n' +
        'and then retry your chosen orange button.'
    );
    chrome.runtime.sendMessage(
        {
            action: 'open_tab',
            url: url
        }
    );
}

// check if request has ended in HTTP310 and return True if it has.
export function checkTooManyRedirects(url: string, req: XMLHttpRequest): boolean {
    if ([310, 0].includes(req.status)) {
        const msg = 'HTTP310: too many redirects when fetching ' + url + ' ' +
                    'which has been redirected ' +
                    req.responseURL ?
                        'to ' + req.responseURL :
                        '' + '\n' +
                    'You might want to consider using the ' +
                    '"force full log out" button and logging yourself back ' +
                    'into Amazon.';
        console.warn(msg);
        rateLimitedAlert(msg);
        return true;
    } else {
        return false;
    }
}

export function forceLogOut(site_url: string) {
    // Dear code reader,
    // This function is a bit of a "try everything"
    // strategy for getting the user logged out enough that
    // any broken state will prevent problems such as infinite redirects
    // and other Amazon site behaviour that blocks the extension from working.
    // In any particular situation, some of the things we do here may be
    // overkill, but each of the strategies have helped in certain situations.

    // Delete some cookies (this is delegated to the background script, because
    // we're not allowed to do it in a content script.
    const cookies: string[] = document.cookie.split('; ');
    cookies.forEach( (cookie: string) => {
        const name: string = cookie.split('=')[0];
        chrome.runtime.sendMessage(
            {
                action: 'remove_cookie',
                cookie_name: name,
                cookie_url: site_url 
            }
        );
    });

    // Amazon stores some non-cookie state that appears to be used to
    // regenerate some cookies.
    localStorage.clear();

    const logout_url = site_url + '/gp/flex/sign-out.html';

    // Call the logout url directly.
    fetch(logout_url).then(
        () => console.log('fetched logout url'),
        (err) => console.warn('fetch logout url failed: ' + err)
    );

    // Call the logout (redirected) page on this tab.
    const logout_with_redirect_url = logout_url + 
        '?path=' + window.location.href +
        '&signIn=1&useRedirectOnSuccess=1' +
        '&action=sign-out&ref_=nav_AccountFlyout_signout';
    window.location.href = logout_with_redirect_url;

    const msg = 'Logged out from Amazon queued as requested. ' +
                'Please log back in and have another try: Good Luck!';
    console.log(msg);
    window.alert(msg);
}
