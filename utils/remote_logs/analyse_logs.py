#!/usr/bin/env python3

import base64
from collections import namedtuple
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
import functools
import itertools
import re
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
def decrypt(cyphertext64):
    key = get_private_key()
    cyphertext = base64.urlsafe_b64decode(cyphertext64 + '=')

    plaintext = key.decrypt(
            cyphertext,
            padding.PKCS1v15(),
            ).decode('utf-8')

    return plaintext


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
                'egrep',
                '-H',
                '"(mulcahyfamily.org).*reallyDisplay"',
                # '"(www.enoughsaved.uk|mulcahyfamily.org)"',
                '/var/log/apache2/other_vhosts*',
            ],
            stdout=subprocess.PIPE,
        )

        log_lines = ssh_grep.communicate()[0].decode('utf-8').split('\n')
        return (line for line in log_lines)

    log_lines = itertools.chain(
        get_log_lines('grep',  '/var/log/apache2/other_vhosts.log'),
        get_log_lines('grep',  '/var/log/apache2/other_vhosts.log.1'),
        get_log_lines('zgrep',  '/var/log/apache2/other_vhosts*.gz'),
    )

    log_line_re = re.compile(
            r'([^:]*):([a-zA-Z0-9.:]+).*(\d+\.\d+\.\d+\.\d+).*\[(.*) \+\d+\].*(GET|HEAD) ([^ ]+)')
    #         file
    #                 server
    #                                   client
    #                                                           date
    #                                                                         method
    #                                                                                    path&params

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
                    sys.stderr.write(str(err) + '\n')

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


for l in get_log_lines():
    print(l)
