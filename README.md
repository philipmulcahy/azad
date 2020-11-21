# azad
## amazon order history reporter chrome extension

---

# HELP!

## Common problems, with some fixes

*If you've not read through this document (and indicated that you've done so in the help request), your help ticket may be closed without further comment.*

### No orders shown even though you know there should be some

Clear amazon cookies: open chrome://settings/siteData and type amazon in the search box, then delete them all. This will log you out.
Then log back in and try again.

### Out of date cache data

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
Please check to see that no-one else has filed a ticket for the same problem. If they have, join in the fun on that ticket rather than making your own "me-too" ticket.


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
* RIGHT-click on the log pane and select "Save as..."
* Save the file as desired.


#### How to save an order debug json file:

* You can only do this when you see the results table.
* RIGHT-click on the order ID link (in the order id column) for the row with the issue.
* Select "save order debug info".
* The debug info should automatically save to your downloads folder.

---

### official installation page

https://chrome.google.com/webstore/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi

### required development package(s)
Node.js®, available at https://nodejs.org

### supported development platforms
MacOS, Windows

#### MacO
* I use homebrew to install node.js and git.
* clone the project source code or fork it: https://github.com/philipmulcahy/azad
* there are a bunch of convenience commands in the npm project file such as:
  * npm run build
  * npm run lint

#### Windows install
* Install Node.js® from https://nodejs.org. Enable the option to install Chocolatey, Python 2, and Visual Studio Build Tools.
* Install GitHub Desktop from https://desktop.github.com.
* Go to https://github.com/philipmulcahy/azad and create a fork.
* Open GitHub Desktop, go to File, Clone Repository, clone from your azad fork.
* Start CMD
* 	CD %UserProfile%\Documents\GitHub\azad
(This is the path shown by GitHub Desktop)
* 	npm install --init


### linting (uses npm lint tools)
```
npm run lint
```

### building
```
npm run build
```

### packaging; this includes building
#### for MacOS
```
npm run package
```
#### for Windows
```
npm run winpackage
```

### installing locally on chrome
* Open chrome, and type chrome://extensions in the address bar.
* Enable the Developer mode slider.
* Remove the store version of the extension.
* Click "Load unpacked".
* Navigate to the build folder.

### installing "secret" unit test data
(it's secret because it contains order details of contributors to the project)
pushd src/tests
git clone git@github.com:philipmulcahy/azad_test_data.git

### running 'unit' tests
* build (see above)
* open/refresh src/tests/tests.html in your browser

### edit-test-loop
Remember to re-build, reload the extension on the chrome://extensions page and reload the targeted amazon page after saving changes to files.
