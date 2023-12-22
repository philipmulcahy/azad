#!/bin/bash

LOG_FILE=$1

perl -ne 'm/NEW (http.*)/ and print qq/$1\n/' ${LOG_FILE} | sort > NEW.txt
perl -ne 'm/NEW -> ENQUEUED (http.*)/ and print qq/$1\n/' ${LOG_FILE} | sort > NEW2ENQUEUED.txt
perl -ne 'm/CACHED -> SUCCESS (http.*)/ and print qq/$1\n/' ${LOG_FILE} | sort > CACHED2SUCCESS.txt
perl -ne 'm/CONVERTED -> SUCCESS (http.*)/ and print qq/$1\n/' ${LOG_FILE} | sort > CONVERTED2SUCCESS.txt
perl -ne 'm/CACHE_HIT -> SUCCESS (http.*)/ and print qq/$1\n/' ${LOG_FILE} | sort > CACHE_HIT2SUCCESS.txt
cat *SUCCESS.txt | sort > ALL_SUCCESS.txt
perl -ne '/([A-Z_]+ -> [A-Z_]+)/ and print qq/$1\n/' ${LOG_FILE} | sort | uniq -c | sort -n | tac > transition_counts.txt
diff NEW.txt ALL_SUCCESS.txt 
