# azad
## amazon order history reporter chrome extension

### official installation page
https://chrome.google.com/webstore/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi

### linting (uses npm lint tools)
```
npm run lint
```

### building
```
npm run build
```

### packaging
```
npm run package
```

### installing locally on chrome
* Open chrome, and type chrome://extensions in the address bar.
* Click "Load unpacked extension...".
* Navigate to the build folder.

### running 'unit' tests
* build (see above)
* open/refresh src/tests/tests.html in your browser

### edit-test-loop
Remember to re-build, reload the extension on the chrome://extensions page and reload the targetted amazon page after saving changes to files.
