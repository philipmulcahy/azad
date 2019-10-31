# azad

## amazon order history reporter chrome extension

### official installation page

<https://chrome.google.com/webstore/detail/amazon-order-history-repo/mgkilgclilajckgnedgjgnfdokkgnibi>

### supported development package(s)

Node.js®, available at <https://nodejs.org>

### supported development platforms

MacOS, Windows

#### MacOS

#### Windows install

* Install Node.js® from <https://nodejs.org>. Enable the option to install Chocolatey, Python 2, and Visual Studio Build Tools.
* Install GitHub Desktop from <https://desktop.github.com>.
* Go to <https://github.com/philipmulcahy/azad> and create a fork.
* Open GitHub Desktop, go to File, Clone Repository, clone from your azad fork.
* Start CMD
* CD %UserProfile%\Documents\GitHub\azad
  (This is the path shown by GitHub Desktop)
* npm install --init

### linting (uses npm lint tools)

``` Shell
npm run lint
```

### building

``` Shell
npm run build
```

### packaging; this includes building

#### for MacOS

``` Bash
npm run package
```

#### for Windows

``` CMD
npm run winpackage
```

### installing locally on chrome

* Open chrome, and type <chrome://extensions> in the address bar.
* Enable the Developer mode slider.
* Remove the store version of the extension.
* Click "Load unpacked".
* Navigate to the build folder.

### running 'unit' tests

* build (see above)
* open/refresh src/tests/tests.html in your browser

### edit-test-loop

Remember to re-build, reload the extension on the <chrome://extensions> page and reload the targeted amazon page after saving changes to files.
