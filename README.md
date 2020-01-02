# azad
## amazon order history reporter chrome extension

---
---
# HELP!!

## If the results are not what you expect, Amazon probably changed something, and the extension hasn't been updated yet.

Your first step should be to go to chrome://extensions and click Update.
After you do this, close and reopen the Amazon page and rerun the report to see if that helped.

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
* Debug info contains LOTS of info you'd probably want kept private, so don't post it on GitHub.

#### How to save a log file
* On the screen showing the report, press Ctrl+Shift+I.
* The log will appear at the bottom of the screen. RIGHT-click and select "Save as..."
* Save the file as desired.

#### How to save a debug file:
* You can only do this when you see the results showing.
* RIGHT-click on the order ID (in the order id column) for the row with the issue.
* Select "save order debug info".
* The debug info will automatically save to your downloads folder.
---
---

### official installation page
https://chrome.google.com/webstore/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi

### supported development package(s)
Node.js®, available at https://nodejs.org

### supported development platforms
MacOS, Windows

#### MacOS

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
pushd src/tests
git clone git@github.com:philipmulcahy/azad_test_data.git

### running 'unit' tests
* build (see above)
* open/refresh src/tests/tests.html in your browser

### edit-test-loop
Remember to re-build, reload the extension on the chrome://extensions page and reload the targeted amazon page after saving changes to files.
