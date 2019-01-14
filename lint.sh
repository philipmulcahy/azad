#!/bin/bash

jshint $(ls *.js | egrep -v "datatables|dom2json|moment|lzjs|sprint")
