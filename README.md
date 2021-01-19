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
	- `all.csv` enthält alle Daten. Gut zu Pivotieren.
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

## FAQ

### Wie oft werden die Daten aktualisiert?

Auf unserer Seite überprüfen wir die Dateien stündlich auf Veränderungen. Laut Aussage des RKIs werden die Daten werktäglich aktualisiert. Somit kann es sein, dass an Sonnabenden oder Sonntagen keine Aktualisierung stattfindet.

### Was mache ich, wenn ich Probleme bei den hier veröffentlichten Daten gefunden habe?

Momentan kümmert sich [Michael Kreil](mailto:rki-scraper@michael-kreil.de) als Entwickler um die Aktualität des Projektes.
Probleme und Feature-Wünsche können als [neues GitHub Issue](https://github.com/ard-data/2020-rki-impf-archive/issues/new) eingetragen werden.
Falls der Scraper mit Veränderungen an den Excel-Tabellen nicht zurecht kommt, erhält Michael automatisch eine Notification auf Handy und versucht, innerhalb von 24 Stunden das Problem zu lösen.
Ansonsten versuchen wir so neutral wie möglich die RKI-Zahlen in JSON und CSV zu "übersetzen". Ggf. können auch die Daten des RKI bereits fehlerhaft sein.

### Was bedeuten die Datumsangaben?

Momentan unterscheiden wir zwei Datumsangaben:
- `date` ist das Datum des Tages, auf den sich die Impfzahlen beziehen.
- `pubDate` bzw. `publication date` sind Datum und Uhrzeit der Veröffentlichung des RKI.
Zwischen diesen beiden Angaben können bis zu 17 Stunden liegen.

## Weitere Links

Andere Projekte, die die RKI-Corona-Impf-Daten sammeln:

- https://github.com/friep/vaccc19de_rki_data
- https://github.com/n0rdlicht/rki-vaccination-scraper
