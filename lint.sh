#!/bin/bash

jshint $(ls *.js | egrep -v "datatables|sprint|moment|lzjs")
