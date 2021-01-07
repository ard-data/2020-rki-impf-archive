#!/bin/bash

source ~/.profile

set -e
set -x
cd "$(dirname "$0")"

git pull

node 1_download.js
node 2_deduplicate.js
node 3_parse.js
node 4_generate_csv.js

sleep 3

git add ../data/
git commit -m "automatic data update" || exit 0
git push

exit 42
