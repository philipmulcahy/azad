#!/bin/bash

sqlite3 "file:/Users/philip/Desktop/azad_local/remote_log_db/remote_log.db?mode=ro" "$@"
