#!/bin/bash

# Extract html captures emebedded in a JSON dump file, including shipment
# tracking pages, and write them out as seperate files.

JSON_FILE=$1

jq -r 'keys[] | select(contains("html"))' ${JSON_FILE} \
  | sort \
  > keys.txt

for KEY in $(cat keys.txt); do
  jq ".${KEY}" $JSON_FILE \
    | perl -pe 's/\\"/"/g' \
    | perl -pe 's/\\n/\n/g' \
    > ${KEY}.html;
done

SHIPMENT_COUNT=$( \
  jq -r \
    ".tracking_data | to_entries | keys | length" \
    ${JSON_FILE} \
)

for idx in $(seq ${SHIPMENT_COUNT}); do
  zero_idx=$(($idx - 1))
  jq -r "nth(${zero_idx}; .tracking_data | .[])" ${JSON_FILE} \
    > "shipment_${zero_idx}.html"
done
