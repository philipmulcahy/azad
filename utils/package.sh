#!/bin/bash

cd $(dirname $0)/..
rm -f azad.zip
npm run build
cp -r build dist
rm dist/alltests.bundle.js
zip -r azad.zip dist
rm -r dist

echo "To test changes, go to chrome://extensions, enable the Developer mode slider, remove the store version of the extension, click 'Load unpacked', and navigate to the build folder."
echo "If you are the extension owner, go to https://chrome.google.com/webstore/developer/edit/mgkilgclilajckgnedgjgnfdokkgnibi and upload the zip file."

