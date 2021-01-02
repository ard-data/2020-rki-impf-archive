#!/bin/bash

cd "$(dirname "$0")"

do_work() {
	set -x

	git pull || return 1

	node 1_download.js || return 1
	node 2_deduplicate.js || return 1
	node 3_parse.js || return 1
	node 4_generate_csv.js || return 1

	sleep 3

	git add ../data/ || return 1
	git commit -m "automatic data update" || return 1
	git push || return 1

	return 0
}

report() {
	cat <(echo -e "Subject: Fehler im RKI Impf cronjob\nFrom: root medium hetzner <root@localhost.localdomain>\n\n") cronjob.log <(echo -e "\n\n.") | sendmail -v bots@michael-kreil.de
}

exec 2>cronjob.log

do_work || report

rm -f cronjob.log
