#!/bin/sh

VENV=.venv
MYDIR=$(dirname $0)
LOG=/Users/philip/tmp/azad_remote_log_save.out

cd $MYDIR

if [ -d $VENV ]; then
  rm -r $VENV
fi

echo "STARTING $(date +"%Y-%m-%dT%H:%M:%S%z")" >>$LOG

python3 -m venv $VENV >>$LOG 2>&1

source ${VENV}/bin/activate >>$LOG 2>&1

${VENV}/bin/pip install -r requirements.txt >>$LOG 2>&1

$VENV/bin/python save_logs.py >>$LOG 2>&1

deactivate >>$LOG 2>&1

echo "FINISHED $(date +"%Y-%m-%dT%H:%M:%S%z")" >>$LOG
