# Azad For Developers

(c) Philip Mulcahy 2021

## required development package(s)
Node.js®, available at https://nodejs.org

## known to be viable development platforms
MacOS, Windows

### MacOS
* I use homebrew to install node.js and git.
* clone the project source code or fork it: https://github.com/philipmulcahy/azad
* there are a bunch of convenience commands in the npm project file such as:
  * npm run build
  * npm run lint
  See below for a more complete list.

### Windows
* Install Node.js® from https://nodejs.org. Enable the option to install Chocolatey, Python 2, and Visual Studio Build Tools.
* Install GitHub Desktop from https://desktop.github.com.
* Go to https://github.com/philipmulcahy/azad and create a fork (unless you own the repo).
* Open GitHub Desktop, go to File, Clone Repository, clone from your azad fork.
* Start CMD
* 	CD %UserProfile%\Documents\GitHub\azad
(This is the path shown by GitHub Desktop)
* 	npm install --init


## linting (uses npm lint tools)
```
npm run lint
```

## building
```
npm run build
```

## packaging; this includes building
### for MacOS
```
npm run package
```
### for Windows
```
npm run winpackage
```

## installing your development version locally on chrome
* Open chrome, and type chrome://extensions in the address bar.
* Enable the Developer mode slider.
* Disable or remove the store version of the extension.
* Click "Load unpacked".
* Navigate to the build folder.

## installing "secret" unit test data
(secret because the data contains order details of contributors to the project)
```
pushd src/tests
git clone git@github.com:philipmulcahy/azad_test_data.git
```

## running 'unit' tests
* build (see above)
* open/refresh src/tests/tests.html in your browser

## edit-test-loop
Remember to re-build, reload the extension on the chrome://extensions page and reload the targeted amazon page after saving changes to files.
