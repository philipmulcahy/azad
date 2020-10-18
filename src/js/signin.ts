/* Copyright(c) 2020 Philip Mulcahy. */


export function checkSigninRedirect(
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
