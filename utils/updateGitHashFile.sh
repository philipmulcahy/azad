#!/bin/bash

cd $(dirname $0)/..

HASH_FILE=src/js/git_hash.ts
HASH=$(git rev-parse HEAD)
DIRT=$(git status --porcelain=v2)

echo "// THIS FILE IS MACHINE WRITTEN DURING BUILD TO GIVE THE EXTENSION'S" > ${HASH_FILE}
echo "// CODE KNOWLEDGE OF THE GIT HASH OF THE BUILT REVISION, AND WHETHER" >> ${HASH_FILE}
echo "// THE CLIENT WAS 'CLEAN' (UN-ALTERED FROM THE COMMITTED REVISION." >> ${HASH_FILE}

if [[ -n $DIRT ]]; then
  echo "function isClean(): boolean { return false; }" >> ${HASH_FILE}
else
  echo "function isClean(): boolean { return true; }" >> ${HASH_FILE}
fi

echo "function hash(): string { return '${HASH}'; }" >> ${HASH_FILE}
