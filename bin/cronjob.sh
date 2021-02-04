#!/bin/bash

source ~/.profile

set -e
set -x
cd "$(dirname "$0")"

git reset --hard
git pull

signalNoUpdate=0
signalUpdate=42

{
	node 1_download.js &&
	node 2_deduplicate.js &&
	node 3_parse.js &&
	node 4_complete_data.js &&
	node 5_generate_csv.js &&
	node 6_generate_old_csv.js &&
	node 7_merge_all.js
} || {
	error=$?
	signalNoUpdate=$error
	signalUpdate=$error
	echo "ERROR happend $error"
}

git add ../data/
git commit -m "automatic data update" || exit $signalNoUpdate
git push

exit $signalUpdate
