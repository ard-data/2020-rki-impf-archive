# RKI-Corona-Impf-Daten-Archiv

## Worum geht es?

Das RKI veröffentlicht täglich die [gemeldeten Impfungen als Excel-Tabelle](https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquoten-Tab.html).

Leider wird diese Excel-Tabelle täglich überschrieben, so dass keine historischen Verläufe möglich sind. Zwar bietet das [Impfdashboard](https://impfdashboard.de/) historische Verläufe, die sind aber wiederum nicht nach Bundesländern aufgeschlüsselt.

Deshalb sammeln wir die alte Datei-Versionen und stellen sie in diesem GitHub-Repo zur Verfügung. Per cronjob versuchen wir das Archiv täglich aktuell zu halten. Als Feature bereinigen wir sogar die Daten und bieten sie als CSV an.

Wer auf die Daten täglich angewiesen ist und bei Problemen benachrichtigt werden möchte, kann sich [hier auf der Mailingliste anmelden](https://lists.riseup.net/www/subscribe/ard_rki_data), um bei Änderungen/Problemen direkt eine Mail zu bekommen.



## Aufbau

### Verzeichnis `data/`

- Die rohen Excel-Dateien werden unter `data/0_original` gespeichert.
- Die gesäuberten Daten landen als JSON unter `data/1_parsed`.
- Die Daten werden geprüft, [vervollständigt](#datenvervollständigung) und landen dann unter `data/2_completed`.
- Daraus werden CSV-Dateien generiert in zwei Versionen: `data/2_csv` und `data/9_csv_v2`.  
	`2_csv` ist das alte CSV-Format, dass zeitnah deaktiviert wird.  
	`9_csv_v2` ist das neue Format, dass die Daten aufschlüsselt nach Bundesländern, Erst-/Zweitimpfung, Hersteller und Indikation, und dessen Feldnamen sich an den Namen des Impfdashboards orientieren.  
  Es gibt jeweils drei CSV-Typen:
		- `all.csv` enthält alle Daten. Gut zu Pivotieren.
		- `region_*` sind Slices nach Region, also Bundesländer/Deutschland.
		- `metric_*` sind Slices nach den Metriken.

Per Cronjob werden die Daten stündlich beim RKI angefragt. Wenn sie beim RKI aktualisiert wurden (also sich der Hash der Exceldatei verändert), wird die neue Datei runtergeladen nach `0_original`, geparst nach `1_parsed`, gesäubert nach `2_completed` und die entsprechenden CSV-Dateien aktualisiert.

### Verzeichnis `bin/`

- `bin/1_download.js` lädt die aktuelle Excel-Tabelle runter.
- `bin/2_deduplicate.js` löscht doppelte Dateien, also wenn die neueste Datei den gleichen SHA256-Hash hat, wie die Datei zuvor.
- `bin/3_parse.js` parsed die Exceldateien und macht daraus saubere und einheitliche JSONs.
- `bin/4_complete_data.js` versucht die Daten zu überprüfen und ggf. fehlende Werte zu ergänzen. Siehe auch: [Datenvervollständigung](#datenvervollständigung)
- `bin/5_generate_csv.js` fügt alle JSONs zusammen und generiert CSV-Dateien.
- `bin/6_generate_old_csv.js` generiert das veraltete CSV-Format.
- `bin/7_merge_all.js` generiert ein großes JSON, dass für eine grafische Vorschau verwendet werden soll.
- `bin/cronjob.sh` ist das stündliche cronjob-Script.

### Verzeichnis `config/`

- `config/data_definition.js` enthält eine abstrakte Beschreibung der Datenstruktur. Sie definiert:
	- 5 Dimensionen:
		- Dosen/Erst-/Zweitimpfung
		- Alle Hersteller/BioNTech/Moderna/…
		- Indikation nach Alter/Beruf/…
		- Wert ist kumulativ/Differenz zum Vortag
		- Wert ist absolut/Prozent der Bevölkerung/Promille.
	- 4 Slices innerhalb des Datenwürfels, deren Werte durch das RKI abgedeckt werden.
	- Eine Funktion `getSlug()`, die eine Adresse innerhalb des Datenwürfels einem eineindeutigen Feldnamen zuordnet.
- `config/known_missing_entries.csv` enthält eine Liste von Werten, die in den RKI-Veröffentlichungen nicht angegeben wurden.
- `config/known_problems.csv` enthält eine Liste von Werten, von denen wir wissen, dass die Summen in den RKI-Veröffentlichungen nicht aufgehen.

## Datenbeschreibung

Diese Daten sind natürlich keine offizielle Veröffentlichung des RKI oder der ARD, sondern eine freundliche Unterstützung für Forschung und Recherche. Auch können wir keine Gewähr für Richtigkeit und Vollständigkeit der Daten geben. Offizielle Daten gibt es nur beim RKI!

Die Beschreibung der Datenfelder, sowie weitere Hinweise können den Exceldateien entnommen werden, so wie der Webseite des RKI.



## Datenvervollständigung

Die "Vervollständigung" durch das Script `bin/4_complete_data.js` besteht aus den folgenden Teilen:

**Schritt 1: Ergänze fehlende Werte** ([`bin/4_complete_data.js` Zeile 76](https://github.com/ard-data/2020-rki-impf-archive/blob/f1e1cf96c3f31409a5a98622e577947f20a36396/bin/4_complete_data.js#L76))

Hier werden die Werte ergänzt, die in den Exceldateien nicht explizit angegeben sind. Z.B. wurden vor dem 17.1.2021 keine Zahlen zu den Zweitimpfungen veröffentlicht, weil noch keine Zweitimpfungen durchgeführt wurden. Inzwischen gibt es zwar Zweitimpfungen, aber nur mit BioNTech, so dass man für "Zweitimpfungen mit Moderna" den Wert 0 annehmen kann.

Sobald eine Annahme zu einer Veränderung eines bereits angegebenen Wertes führt, bricht das Script mit einem Fehler ab.

**Schritt 2: Ergänze berechnete Werte** ([`bin/4_complete_data.js` Zeile 96](https://github.com/ard-data/2020-rki-impf-archive/blob/f1e1cf96c3f31409a5a98622e577947f20a36396/bin/4_complete_data.js#L96))

In [`bin/4_complete_data.js` Zeile 158](https://github.com/ard-data/2020-rki-impf-archive/blob/f1e1cf96c3f31409a5a98622e577947f20a36396/bin/4_complete_data.js#L158) werden Checks definiert. Diese Checks beinhalten, dass z.B. die Summe aller "Dosen nach Herstellern" gleich aller "Dosen" entspricht, oder dass z.B. Anzahl Erstimpfungen plus Anzahl Zweitimpfungen gleich die Anzahl der Dosen entspricht, usw.

Sobald eine Berechnung zu einer Veränderung eines bereits angegebenen Wertes führt, bricht das Script mit einem Fehler ab - es sei denn, das Problem ist bekannt und wurde manuell als Ausnahme eingetragen in `config/known_problems.csv`.

**Schritt 3: Überprüfe, ab alle Werte vorhanden sind** ([`bin/4_complete_data.js` Zeile 130](https://github.com/ard-data/2020-rki-impf-archive/blob/f1e1cf96c3f31409a5a98622e577947f20a36396/bin/4_complete_data.js#L158))

Hier werden noch einmal alle möglichen Werte überprüft, ob sie angegeben wurden. Sobald ein Wert fehlt, bricht das Script mit einem Fehler ab - es sei denn, das Problem ist bekannt und wurde manuell als Ausnahme eingetragen in `config/known_missing_entries.csv`.



## FAQ

### Wo finde ich weiter Zahlen?

Das offizielle [Impfdashboard](https://impfdashboard.de/) des RKIs und des BMG bietet einen [Datendownload](https://impfdashboard.de/static/data/germany_vaccinations_timeseries_v2.tsv) an. Diese Zahlen sind im Zweifelsfall genauer, da sie auch Nachmeldungen enthalten, also Impfungen, die dem RKI erst mehrere Tage später gemeldet werden. Leider liegen die Zahlen nur für ganz Deutschland vor und sind nicht nach Bundesländern aufgeschlüsselt.

### Wie oft werden die Daten aktualisiert?

Auf unserer Seite überprüfen wir die Dateien stündlich auf Veränderungen. Laut Aussage des RKIs werden die Daten werktäglich aktualisiert. Somit kann es sein, dass an Sonnabenden oder Sonntagen keine Aktualisierung stattfindet.

### Was bedeuten die Datumsangaben?

Momentan unterscheiden wir zwei Datumsangaben:

- `date` ist das Datum des Tages, auf den sich die Impfzahlen beziehen.
- `pubDate` bzw. `publication date` sind Datum und Uhrzeit der Veröffentlichung des RKI.

Zwischen diesen beiden Angaben können bis zu 17 Stunden liegen.

### Was mache ich, wenn ich Probleme bei den hier veröffentlichten Daten gefunden habe?

Wir versuchen so neutral wie möglich die RKI-Zahlen aus den Excel-Tabellen in JSON und CSV zu übersetzen, und nur offensichtliche Fehler zu korrigieren.

Falls der Scraper mit Veränderungen an den Excel-Tabellen nicht zurecht kommen oder auf Datenfehler stoßen sollte, bekommen wir automatisch eine Notification und versuchen das Problem so schnell wie möglich zu beheben.

Probleme und Feature-Wünsche können als [neues GitHub Issue](https://github.com/ard-data/2020-rki-impf-archive/issues/new) eingetragen werden.

Wer bei Änderungen oder Problemen direkt per Mail benachrichtigt werden möchte, kann sich [hier auf der Mailingliste anmelden](https://lists.riseup.net/www/subscribe/ard_rki_data).

In Notfällen kann der Autor dieses Projektes auch per [Mail](mailto:rki-scraper@michael-kreil.de) erreicht werden.



## Weitere Links

Andere Projekte, die die RKI-Corona-Impf-Daten sammeln:

- https://github.com/friep/vaccc19de_rki_data
- https://github.com/n0rdlicht/rki-vaccination-scraper
