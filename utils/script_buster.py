#!/usr/bin/env python3

import lxml
from lxml.html.clean import Cleaner
import sys

if len(sys.argv) != 2:
    sys.stderr.write(
        'You must provide exactly one command line arg, which should be a valid path to an html file\n')
    exit(1)
HTML_IN_PATH = sys.argv[1]

dirty = ''.join(open(HTML_IN_PATH).readlines())
cleaner = Cleaner()
cleaner.javascript = True
parsed = lxml.html.fromstring(dirty)
cleaned = cleaner.clean_html(parsed)
clean = lxml.html.tostring(cleaned)
print(clean)
