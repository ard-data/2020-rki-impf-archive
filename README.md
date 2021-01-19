<h1 style="color:#ff0000">RKI hat das Format geändert. Parser funktioniert nicht. Wird überarbeitet und sollte in Kürze wieder funktionieren.</h1>

# RKI-Corona-Impf-Daten-Archiv

## Worum geht es?

Das RKI veröffentlicht täglich die [gemeldeten Impfungen als Excel-Tabelle](https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquoten-Tab.html).

Leider wird diese Excel-Tabelle täglich überschrieben, so dass keine historischen Verläufe möglich sind.

Deshalb sammeln wir die alte Datei-Versionen und stellen sie in diesem GitHub-Repo zur Verfügung. Per cronjob versuchen wir das Archiv täglich aktuell zu halten. Als Feature bereinigen wir sogar die Daten und bieten sie als CSV an.

## Aufbau

### Verzeichnis `/data/`

- Die rohen Excel-Dateien befinden sich unter `data/0_original`.
- Die gesäuberte Daten landen als JSON unter `data/1_parsed`.
- Daraus werden CSV-Dateien generiert unter `data/2_csv`. Dabei gibt es drei CSV-Typen:
	- `all.csv` enthält alle Daten. Gut zu pivotieren.
	- `region_*` sind Slices nach Region, also Bundesländer/Deutschland.
	- `metric_*` sind Slices nach den Metriken.

Per Cronjob werden die Daten stündlich beim RKI angefragt. Wenn sie beim RKI aktualisiert wurden (also sich der Hash der Exceldatei verändert), wird die neue Datei runtergeladen nach `0_original`, gesäubert nach `1_parsed` und die CSV-Dateien aktualisiert in `2_csv`.

### Datenbeschreibung

Diese Daten sind natürlich keine offizielle Veröffentlichung des RKI oder der ARD, sondern eine freundliche Unterstützung für Forschung und Recherche. Auch können wir keine Gewähr für Richtigkeit und Vollständigkeit der Daten geben. Offizielle Daten gibt es nur beim RKI!

Die Beschreibung der Datenfelder, sowie weitere Hinweise können den Exceldateien entnommen werden, so wie der Webseite des RKI.

### Verzeichnis `/bin/`

- `bin/1_download.js` ist ein einfacher Downloader
- `bin/2_deduplicate.js` löscht doppelte Dateien, also wenn es keine Änderungen an den Daten gab.
- `bin/3_parse.js` parsed die Exceldateien und macht daraus saubere und einheitliche JSONs.
- `bin/4_generate_csv.js` fügt alle JSONs zusammen und generiert CSV-Dateien.
- `bin/cronjob.sh` ist das stündliche cronjob-Script.

## Weitere Links

Andere Projekte, die die RKI-Corona-Impf-Daten sammeln:

- https://github.com/friep/vaccc19de_rki_data
- https://github.com/n0rdlicht/rki-vaccination-scraper
