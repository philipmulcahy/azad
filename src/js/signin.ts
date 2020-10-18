/* Copyright(c) 2020 Philip Mulcahy. */


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
        window.alert(msg);
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
