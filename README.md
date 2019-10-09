# azad
## amazon order history reporter chrome extension

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
* Open GitHub Desktop, go to File, Clone Repository, clone from philipmulcahy/azad.
* Start CMD
* 	CD %UserProfile%\Documents\GitHub\azad
(This is the path shown by GitHub Desktop)
* 	npm install --init


### linting (uses npm lint tools)
You'll need to build first, the first time.
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
* Click "Load unpacked".
* Navigate to the build folder.

### running 'unit' tests
* build (see above)
* open/refresh src/tests/tests.html in your browser

### edit-test-loop
Remember to re-build, reload the extension on the chrome://extensions page and reload the targeted amazon page after saving changes to files.
