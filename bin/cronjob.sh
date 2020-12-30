#!/bin/bash

source ~/.profile

set -e
cd "$(dirname "$0")"

git pull

node 1_download.js
node 2_deduplicate.js
node 3_parse.js

git add ../data/
git commit -m "automatic data update"
git push
