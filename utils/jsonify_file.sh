#!/bin/bash

INFILE=$1
OUTFILE=$2

cat $INFILE \
  | perl -pe 's/\\'/'/g' \
  | perl -pe 's/\n/\\n/g' \
  | perl -pe 's/\t/\\t/g' \
  | perl -pe 's/  */ /g' \
  | perl -pe 's/"/\\"/g' \
  > $OUTFILE
