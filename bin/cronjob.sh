#!/bin/bash

set -e
cd "$(dirname "$0")"
set -x

git pull

node 1_download.js
node 2_deduplicate.js
node 3_parse.js
node 4_generate_csv.js

sleep 3

git add ../data/
git commit -m "automatic data update"
git push
