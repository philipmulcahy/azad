#!/usr/bin/env python3

import base64
from collections import namedtuple
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
import contextlib
import datetime
import functools
import hashlib
import itertools
import re
import sqlite3
import subprocess
import sys

@functools.cache
def get_private_key():
    with open('/Users/philip/.ssh/azad_extension_rsa', 'r') as f:
        return serialization.load_pem_private_key(
                f.read().encode(),
                None,  # no password
                )


"""
Params:
    cypher_text_64: string - url safe base64 string

Returns: plaintext string
"""
def decrypt(cyphertext_us64):
    key = get_private_key()
    cyphertext64 = base64.urlsafe_b64decode(cyphertext_us64 + '=')
    cyphertext = base64.b64decode(cyphertext64)

    plaintext = key.decrypt(
            cyphertext,
            padding.PKCS1v15(),
            ).decode('utf-8')

    return plaintext

QueryLog = namedtuple(
    'QueryLog',
    [
        'log_line',
        'file',
        'server',
        'client_ip',
        'date',
        'method',
        'path',
        'params'
    ])


"""
Params: none
Returns: generator of parsed log entries, with decrypted userids
"""
def get_log_lines():
    log_server = 'purple.local'
    
    def get_log_lines(grep, filepattern):
        ssh_grep = subprocess.Popen(
            [
                'ssh',
                'purple.local',
                grep,
                '-H',
                '"azad-extension.co.uk.*operation"',
                filepattern,
            ],
            stdout=subprocess.PIPE,
        )

        log_lines = ssh_grep.communicate()[0].decode('utf-8').split('\n')
        return (line for line in log_lines)

    log_lines = itertools.chain(
        get_log_lines('grep',  '/var/log/apache2/other_vhosts_access.log'),
        get_log_lines('grep',  '/var/log/apache2/other_vhosts_access.log.1'),
        get_log_lines('zgrep',  '/var/log/apache2/other_vhosts_access.log.*.gz'),
    )

    log_line_re = re.compile(
            r'([^:]*):([a-zA-Z0-9.:]+).*(\d+\.\d+\.\d+\.\d+).*\[(.*) \+\d+\].*(GET|HEAD) ([^ ]+)')
    #         file
    #                 server
    #                                   client
    #                                                           date
    #                                                                         method
    #                                                                                    path&params

    def make_log_object(line):
        match = log_line_re.match(line)

        if not match:
            return None
        
        path_params = match.group(6)
        (path, params) = \
                (path_params, None) \
                if path_params.find('?') == -1 \
                else path_params.split('?')

        def maybe_decrypt_param(key, value):
            if key == 'userid':
                try:
                    return decrypt(value)
                except Exception as err:
                    sys.stderr.write(f'caught {str(err)} while decrypting {key}\n')

            return value

        if params:
            params = {
                p[0]: maybe_decrypt_param(p[0], p[1])
                for p in [
                    p.split('=') for p in params.split('&')
                ]
            }

        return QueryLog(
            log_line=line, 
            file=match.group(1),
            server=match.group(2),
            client_ip=match.group(3),
            date=match.group(4),
            method=match.group(5),
            path=path,
            params=params,
        )

    return (
        ql
        for line in log_lines
        if (ql := make_log_object(line))
    )

# test_plaintext = decrypt('YzhVUHZOS3NwTlhXdUZ2SFdxb3ZQQzhsUjg0ODFaMmZYbTRYOFkyOFAwWlhGOXEwQWFFQmw2TDRKRTBVV3lnRjJ0eXNCNDJNbEJtM3R5eUV1Z0VIMU80by8rL0tLeFNDamFHS2twU2JrM04zVzZ4SVVDZVJ5OFBWNWR6enJlZjI3NytJb3lOY1RFYyt4Y2p3a0I0Snljb2crSUFsR25BNEhtdUo0NHZ4ajhRZ2VnUCs3N0hzSit4SFlqQVgwcFJpNW0yUkRFQmtQY3Q5c3hPTVh0MUFZYnlqVzZFK1M5M3FueU9hZ0Y4S0sxOVhXclorVWZ4bTJTRHJrN2YwWHEyZ2cvb1A1M2RoS1dFalNnWVpQR3MvSzVZQngwM3d1Mk5YQTNab3hyT293U0wvNGZtTUhldzFUcDlyU2xqR0s3YkV3WWt4aVZaWkdLd0NOVThGbm5QbEhQWndhOHpMeHpKR25idy81Q001NTVwem9sQWNyZ01nMmQwU2x2MUJleWRqaThYWG5ML3Qzbk9TTll6WHMrbjkxRmkvdEtsYzNTaEhyQzJqMEVNREJVbC9nWEplOVovei9aS09rMjdtamhnUlNxLzcvcWphSlZGb3MxNkFJelNnVzl2a2MvTDRmeXA2NUd5Q0lWNS94M0hMaXJhV1M0STNDWkpTZmUzeW9Za1o==')

# print(test_plaintext)

def save_events_to_database(log_lines: list[QueryLog]) -> None:
    # CREATE TABLE events (
    #   hash TEXT PRIMARY KEY,
    #   timestamp TEXT,
    #   userid TEXT,
    #   client TEXT,
    #   operation TEXT,
    #   status TEXT,
    #   rowcount INTEGER,
    #   logline TEXT
    # );

    LogRow = namedtuple(
          'LogRow',
          [
              'hash',
              'timestamp',
              'userid',
              'client',
              'operation',
              'status',
              'rowcount',
              'logline'
          ]
    )

    def row_from_query_log(ql: QueryLog) -> LogRow:
        timestamp = datetime.datetime.strptime(
                ql.date, '%d/%b/%Y:%H:%M:%S').isoformat()

        userid = ql.params['userid']
        operation = ql.params['operation']
        status = ql.params['status']
        rowcount = ql.params['rowCount']

        # logline contains the source log file name, which gets rotated, so
        # must be excluded to avoid semantically duplicate records.
        hash_string = f'{timestamp}#{userid}#{operation}#{status}#{rowcount}'

        hashcode=hashlib.blake2b(
            hash_string.encode('utf-8'),
            digest_size=32, # 256 bits
            ).hexdigest()

        return LogRow(
            hash=hashcode,
            timestamp=timestamp,
            userid=userid,
            client=ql.client_ip,
            operation=operation,
            status=status,
            rowcount=rowcount,
            logline=ql.log_line,
        )

    with contextlib.closing(sqlite3.connect(
            '/Users/philip/Desktop/azad_local/remote_log_db/remote_log.db'
            )) as con:
        cur = con.cursor();

        def insert_if_not_present(row: LogRow):
            present = cur.execute(
                    f'SELECT 1 FROM events WHERE hash="{row.hash}"').fetchone()

            if present:
                sys.stderr.write(f'db already has {row.hash}\n')
            else:
                sys.stderr.write(f'adding {row.hash} to db\n')
                cur.executemany(
                        'INSERT INTO events VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
                        [tuple(row)])

            con.commit()

        for line in log_lines:
            row = row_from_query_log(line)
            insert_if_not_present(row)

def copy_new_rows_to_database():
    lines = list(get_log_lines())
    save_events_to_database(lines)

copy_new_rows_to_database()
