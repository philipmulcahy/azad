#!/bin/bash

cd $(dirname $0)/..
npm run build
rm -f azad.zip
zip -r azad.zip build

echo "To test changes, go to chrome://extensions, enablethe Developer mode slider, remove the store version of the extension, click "Load unpacked", and navigate to the build folder.
echo "If you are the extension owner, go to https://chrome.google.com/webstore/developer/edit/mgkilgclilajckgnedgjgnfdokkgnibi and upload the zip file."

