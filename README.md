# azad
## amazon order history reporter chrome extension

### official installation page
https://chrome.google.com/webstore/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi

Maybe the UID on the end of the URL changes when we publish a new version?

### linting (uses npm lint tools)
```
./lint.sh
```

### installing locally on chrome
* Open chrome, and type chrome://extensions in the address bar.
* Click "Load unpacked extension...".
* Navigate to the azad folder.

### edit-test-loop
Remember to refresh/reload both on the extension page and targetted amazon page after saving changes to files.
Test code can be exercised in the browser by opening ./tests/tests.html
