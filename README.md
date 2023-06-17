# Azad: amazon order history reporter chrome extension

## Official installation page
https://chrome.google.com/webstore/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi

## Commercial Features 2023
A clear(ish) signal has emerged from the 2022 survey - here are the top two requested features:
1) Report ASINs, price, and quantity
2) Scrape specific month/quarter

I got these working and deployed them behind a preview subscription paywall in v1.9.26 in June 2023.
When the GBP 5000 charity goal is reached, they will become free.
Paywall subscription/donations count towards the total (less the fees that stripe and others charge).
As and when I develop new features, I may choose to put them behind the paywall for a time.
At the moment, the one I know I want to work on is Tracking Links - lots of users have asked for this.

Check out [commercial_features.md](doc/commercial_features.md) for more detail.

# Help!

## Common problems, with some fixes

*If you've not read through this document (and indicated that you've done so in the help request), your help ticket may be closed without further comment.*

### No orders shown even though you know there should be some

Clear amazon cookies: open chrome://settings/siteData and type amazon in the search box, then delete them all. This will log you out.
Then log back in and try again.

### Out-of-date cache data

#### How could this have happened to me?

Maybe a new version of the extension has broken how the cache data is interpreted, or Amazon has changed their website breaking compatibility between the cached data and the live site (the cached data contains amazon generated urls).

#### What's the workaround?

If the extension is working, stop it by pressing the stop button.
Then click the "Clear Cache" button and resume normal use.

### Log-in message

Parts of Amazon's websites appear to have defences against denial of service or site scraping attacks.
If the extension needs to make a lot of requests (because you've got lots of orders or you choose many years, then it can log you out. This often happens only for types of orders or types of order related pages (payments, details) etc, leaving the other types of pages functional. The extension detects this and opens up a new sign-in page so you can log back in.
Once you've done this, you can restart the year fetch - it should avoid re-fetching stuff it's already put in the cache.

### Stuck progress in popup status/statistics

Symptoms: pending task count sticks at a non-zero number for many seconds.
I don't understand why this happens, but the workaround that has always worked for me is to remove all amazon cookies (this will log you out) and then everything works again.
If you look in the extension logs (see below), a clue that this is appropriate is entries in the log that complain about too many redirections.

### Amazon changed their site

The extension needs to be updated by developers to learn the new layout.
Please check to see that no-one else has filed a ticket for the same problem. If they have, join in the fun on that ticket rather than making your own "me-too" ticket. At some point you're going to need to work with us by providing debug data and testing experimental versions of the extension. I don't have direct access to your orders (or likely you country's version of Amazon), so if you're not willing to help, please don't waste everybody's time with a ticket - your issue will not get fixed.

### You've got a country+order_type combination we've not got test data for

See Amazon changed their site above.

## Generic work-arounds

Your first step should be to go to chrome://extensions and click Update.
After you do this, close and reopen the Amazon page and rerun the report to see if that helped.

Next, open chrome://settings/siteData and type amazon in the search box, then delete them all. This will log you out.
This is particularly useful for fixing problems where it looks like the extension got stuck/bored - sometimes Amazon starts giving the extension the run-around with infinite redirect links. Deleting cookies and logging back in seems to work. You don't need to delete non-amazon cookies.

Please go to https://github.com/philipmulcahy/azad/issues to see issues which have already been reported.

If you believe that you have the same issue, please add a comment.
If the issue you have seems new, please create a new issue and describe what you see and what you expect to see.

Either way, please include the Amazon address, such as https://www.amazon.com/gp/your-account/order-history

This serves two purposes:
* You'll be notified of updates.
* The project owner will be able to contact you for more information, if needed.

Before you send log files, debug info, or screenshots, please be aware that postings on GitHub are NOT private.
If you have log files, debug info, or screenshts to send but don't want them to be public, please ask how to send.

* Log files are usually free of personal info.
* Screenshots can be edited with a image editor to overwrite anything you don't want public, such as name, address, product description, or last 4 of the card.
* Debug info contains info you'd probably want kept private (though we've not seen any credit card info), so don't post it on GitHub.


#### How to save a log file

* On the screen showing the report, press Ctrl+Shift+I (Cmd+Shift+I on MacOs) to open Chrome Developer Tools
* The Console log might appear at the bottom of the screen, but if it doesn't press "Console" (near to top of the tools pane)
* Once the console is open, do your thing with the extension. If you command a scrape and only then open the console, you'll probably only get the last few hundred lines of log. I think this is to save memory.
* RIGHT-click on the log pane and select "Save as..."
* Save the file as desired.


#### How to save and send an order debug json file

* You can only do this when you see the results table.
* RIGHT-click on the order ID link (in the order id column) for the row with the issue.
* Select "save order debug info".
* The debug info should automatically save to your downloads folder.
* DO NOT attach this file to a github ticket - although it doesn't contain passwords or full credit card numbers, it is likely to contain your name and address and some details of stuff you've ordered. Instead, send it to azadextension@gmail.com with the subject line including the ticket link. I (Philip) do not monitor this email address so you should also post on the ticket to say you've emailed a json file.
* Q: Who gets to see my data?
* A: The developer of the extension and possibly a small group of collaborators. The data is kept in a private repo whose maximum number of developers is limited to 10. Currently only one collaborator has access.
* Q: Why do you keep the data?
* A: To ensure that the fixes we prepare using your data stay fixed (known as a regression test).

#### How to try out an experimental version

This may be necessary if you are sent a link to a zip file (probably something like https://mulcahyfamily.org/azad/azad_12345678.zip)

1) Download the zip file
2) Unzip it to a folder
3) Open chrome://extensions/
4) Set "Developer mode" (slider in top right hand corner)
5) Disable any existing installed Amazon Order History Reporter extension - you don't want two of them fighting (slider in bottom right of the extension's tile).
6) Click "Load unpacked" (top left)
7) Navigate to the azad folder you unzipped in step (2)
8) Open an Amazon tab and start testing.
9) Remember to uninstall or disable the test version once you've finished playing. It will not automatically update with fixes, unlike the chrome web store version.



