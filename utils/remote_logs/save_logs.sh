#!/bin/sh

VENV=.venv
MYDIR=$(dirname $0)
cd $MYDIR

if [ -d $VENV ]; then
  rm -r $VENV
fi

python3 -m venv $VENV

source ${VENV}/bin/activate

${VENV}/bin/pip install -r requirements.txt

$VENV/bin/python save_logs.py

deactivate
