#!/bin/bash

cd $(dirname $0)/..
npm run build
rm -f azad.zip
zip -r azad.zip build
echo "Go to https://chrome.google.com/webstore/developer/edit/mgkilgclilajckgnedgjgnfdokkgnibi and upload the zip file."
