# RKI-Corona-Impf-Daten-Archiv

## Worum geht es?

Das RKI veröffentlicht täglich die [gemeldeten Impfungen als Excel-Tabelle](https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquoten-Tab.html).

Leider wird diese Excel-Tabelle täglich überschrieben, so dass keine historischen Verläufe möglich sind. Zwar bietet das [Impfdashboard](https://impfdashboard.de/) historische Verläufe, die sind aber wiederum nicht nach Bundesländern etc. aufgeschlüsselt.

Deshalb sammeln wir die alten Datei-Versionen und stellen sie in diesem GitHub-Repo zur Verfügung. Per cronjob versuchen wir das Archiv täglich aktuell zu halten. Als Feature bereinigen wir sogar die Daten und bieten sie [als CSV](https://github.com/ard-data/2020-rki-impf-archive/tree/master/data/9_csv_v3) an.

**Hier können alle CSV-Dateien direkt runtergeladen werden: https://ard-data.github.io/2020-rki-impf-archive/data/9_csv_v3/**

Wer auf die Daten täglich angewiesen ist und bei Problemen benachrichtigt werden möchte, kann sich [hier auf der Mailingliste anmelden](https://lists.riseup.net/www/subscribe/ard_rki_data), um bei Änderungen/Problemen direkt eine Mail zu bekommen.



## Aufbau

### Verzeichnis `data`

- Die rohen Excel-Dateien werden unter `data/0_original` gespeichert.
- Die gesäuberten Daten landen als JSON unter `data/1_parsed`.
- Die Daten werden geprüft, [vervollständigt](#datenvervollständigung) und landen dann unter `data/2_completed`.
- Daraus werden CSV-Dateien generiert und aufschlüsselt nach Bundesländern, Erst-/Zweitimpfung, Hersteller usw. in `data/9_csv_v3` abgelegt.  
  Es gibt dabei drei CSV-Typen:
		- `all.csv` enthält alle Daten. Gut zu Pivotieren.
		- `region_*` sind Slices nach Region, also Bundesländer/Deutschland.
		- `metric_*` sind Slices nach den Metriken.
- Wenn man auf die CSV-Dateien z.B. per Ajax zugreifen möchte, kann man das über github.io tun. Der Einfachheit halber haben wir dafür [hier eine Liste der CSV-Dateien auf github.io](https://ard-data.github.io/2020-rki-impf-archive/data/9_csv_v3/) erstellt.

Per Cronjob werden die Daten alle 20 Minuten beim RKI angefragt. Wenn sie beim RKI aktualisiert wurden (also sich der Hash der Exceldatei verändert), wird die neue Datei runtergeladen nach `0_original`, geparst nach `1_parsed`, gesäubert nach `2_completed` und die entsprechenden CSV-Dateien in `9_csv_v3` aktualisiert.


### Verzeichnis `bin`

- `bin/1_download.js` lädt die aktuelle Excel-Tabelle runter.
- `bin/2_deduplicate.js` löscht doppelte Dateien, also wenn die neueste Datei den gleichen SHA256-Hash hat, wie die Datei zuvor.
- `bin/3_parse.js` parsed die Exceldateien und macht daraus saubere und einheitliche JSONs.
- `bin/4_complete_data.js` versucht die Daten zu überprüfen und ggf. fehlende Werte zu ergänzen. Siehe auch: [Datenvervollständigung](#datenvervollständigung)
- `bin/5_generate_csv.js` fügt alle JSONs zusammen und generiert CSV-Dateien.
- `bin/cronjob.sh` ist das cronjob-Script, dass alle 20 Minuten läuft.


### Verzeichnis `config`

- `config/data_definition.js` enthält eine abstrakte Beschreibung der Datenstruktur. Sie definiert:
	- 7 Dimensionen:
		- Dosen/Erst-/Zweitimpfung
		- Alle Hersteller/BioNTech/Moderna/…
		- Indikation nach Alter/Beruf/…
		- Wert ist kumulativ/Differenz zum Vortag
		- Wert ist absolut/Prozent der Bevölkerung/Promille
		- Impfstelle, also Impfzentren oder Arztpraxen
		- Alter, also sind die Geimpften unter oder über 60 Jahre alt.
	- 6 Slices innerhalb des Datenwürfels, deren Werte durch die RKI-Veröffentlichungen abgedeckt werden.
	- Eine Funktion `getSlug()`, die eine Adresse innerhalb des Datenwürfels einem eineindeutigen Feldnamen zuordnet.
- `config/known_missing_entries.csv` enthält eine Liste von Werten, die in den RKI-Veröffentlichungen gefehlt haben.
- `config/ignore_problems.csv` enthält eine Liste von Werten, von denen wir wissen, dass die Summen in den RKI-Veröffentlichungen nicht aufgehen.
- `config/fix_problems.csv` enthält eine Liste von manuellen Korrekturen.


## Datenbeschreibung

Die Daten in diesem Repo sind natürlich keine offizielle Veröffentlichung des RKI oder der ARD, sondern eine freundliche Unterstützung für Forschung und Recherche. Auch können wir keine Gewähr für Richtigkeit und Vollständigkeit der Daten geben. Offizielle Daten gibt es nur beim RKI!

Die Beschreibung der Datenfelder, sowie weitere Hinweise können den Exceldateien entnommen werden, so wie der Webseite des RKI.

Inzwischen gibt es über 80 verschiedene Felder. Als Hilfestellung wird eine [automatisch generierte Übersicht aller Parameter](https://ard-data.github.io/2020-rki-impf-archive/parameters.html) erzeugt.

### Erstimpfung, Zweitimpfung, volle Impfung, ...

Seit Einführung von Janssen/Johnson & Johnson, einem Impfstoff, der nur in einer einzelnen Dosis verabreicht wird, gibt es Verwirrungen um das Wording. Vielleicht hilft die folgende Tabelle dabei, das Wording des RKIs und die Feldnamen in diesem Repo zu verstehen.

<table>
<tr>
	<th>Erste Dosis Astra/BionTech/Moderna</th>
	<th>Einzeldosis Janssen</th>
	<th>Zweite Dosis Astra/BionTech/Moderna</th>
</tr>
<tr>
	<td align="center"><i>„begonnene Impfserie“</i><br>Feldname: <code>personen_erst</code></td>
	<td colspan="2" align="center"><i>„vollständig geimpft“</i><br>Feldname: <code>personen_voll</code></td>
</tr>
<tr>
	<td colspan="2" align="center"><i>„mindestens einmal geimpft“</i><br>Feldname: <code>personen_min1</code></td>
	<td align="center"><i>„Impfserie beendet“</i><br>Feldname: <code>personen_zweit</code></td>
</tr>
<tr>
	<td colspan="3" align="center"><i>„verabreichte Impfdosen“</i><br>Feldname: <code>dosen</code></td>
</tr>
</table>

Insbesondere muss darauf geachtet werden, dass die Summe aus *„mindestens einmal geimpft“* und *„vollständig geimpft“* nicht mehr gleich der Summe der *„verabreichten Impfdosen“* entspricht, da bei der Addition die Janssen-Dosen zweimal gezählt werden.

Das RKI erklärt das in der Exceldatei folgendermaßen:
> Die Gesamtzahl mindestens einmal Geimpfter umfasst alle Personen, die Erstimpfungen mit den Impfstoffen von BioNTech, Moderna oder AstraZeneca oder eine Impfung mit dem Impfstoff Janssen erhalten haben. Als vollständig geimpft gelten alle Personen, die Zweitimpfungen mit BioNTech, Moderna oder AstraZeneca oder eine Impfung mit Janssen erhalten haben. Die Impfungen mit Janssen sind daher sowohl in der Gruppe "mindestens einmal geimpft" als auch in der Gruppe "vollständig geimpft" enthalten. Sie werden für die Gesamtzahl der verabreichten Impfungen jedoch nur einmal gezählt.

## Datenvervollständigung

Die "Vervollständigung" durch das Script `bin/4_complete_data.js` besteht aus den folgenden Teilen:

**Schritt 1: Ergänze fehlende Werte** ([`bin/4_complete_data.js` Zeile 82](https://github.com/ard-data/2020-rki-impf-archive/blob/3891e3a0e48803fd855145eef50ef355f7d0e71d/bin/4_complete_data.js#L82))

Hier werden die Werte ergänzt, die in den Exceldateien nicht explizit angegeben sind. Z.B. wurden vor dem 17.1.2021 keine Zahlen zu den Zweitimpfungen veröffentlicht, weil noch keine Zweitimpfungen durchgeführt wurden. Durch das Script wird daher automatisch der Wert 0 eingetragen. Außerdem wurden bis zum 4.2. nur Zweitimpfungen mit BioNTech durchgeführt, so dass man für "Zweitimpfungen mit Moderna" den Wert 0 annehmen kann, usw.

Sobald eine Annahme zu einer Veränderung eines bereits angegebenen Wertes führt, bricht das Script mit einem Fehler ab.

**Schritt 2: Berechne fehlende Werte** ([`bin/4_complete_data.js` Zeile 125](https://github.com/ard-data/2020-rki-impf-archive/blob/c08babf62f3a4e310564714db38f8739587b3632/bin/4_complete_data.js#L125))

In [`bin/4_complete_data.js` Zeile 185](https://github.com/ard-data/2020-rki-impf-archive/blob/c08babf62f3a4e310564714db38f8739587b3632/bin/4_complete_data.js#L185) werden Checks definiert. Diese Checks beinhalten, dass z.B. die Summe aller "Dosen nach Herstellern" gleich aller "Dosen" entspricht, oder dass z.B. Anzahl Erstimpfungen plus Anzahl Zweitimpfungen gleich die Anzahl der Dosen entspricht, usw.

Sobald eine Berechnung zu einer Veränderung eines bereits angegebenen Wertes führt, bricht das Script mit einem Fehler ab - es sei denn, das Problem ist bekannt und wurde manuell als Ausnahme eingetragen in `config/ignore_problems.csv`.

**Schritt 3: Überprüfe, ab alle Werte vorhanden sind** ([`bin/4_complete_data.js` Zeile 155](https://github.com/ard-data/2020-rki-impf-archive/blob/c08babf62f3a4e310564714db38f8739587b3632/bin/4_complete_data.js#L155))

Hier werden noch einmal alle möglichen Werte überprüft, ob sie angegeben wurden. Sobald ein Wert fehlt, bricht das Script mit einem Fehler ab - es sei denn, das Problem ist bekannt und wurde manuell als Ausnahme eingetragen in `config/known_missing_entries.csv`.



## FAQ


### Unter welcher Lizenz stehen die Daten hier?

Wir empfehlen auf jeden Fall das RKI als Quelle anzugeben. Über freundliche Erwähnungen dieses Repos freuen wir uns natürlich auch.


### Der Wert für "Differenz zum Vortag" scheint lückenhaft zu sein. Was tun?

Auch bei den Impfdaten gibt es eine Meldekette von z.B. der Arztpraxis über die Bundesländer bis zum RKI. Das heißt, auch hier gibt es Probleme mit Meldeverzug und Nachmeldungen Tage später etc. Damit ist es völlig unmöglich, einen soliden Wert für "Differenz zum Vortag" anzugeben. Wir empfehlen von der Nutzung abzusehen. Vielleicht gibt es ja eine andere Metrik, die aussagekräftiger ist.  
Wir geben trotzdem den Wert für "Differenz zum Vortag" 1:1 vom RKI weiter.


### Sind die Daten hundertprozentig korrekt?

Wir versuchen die offiziellen Zahlen des RKI 1:1 zu konvertieren und dabei sicherzustellen, dass die Konvertierung die Zahlen nicht verändert.  
Was die Korrektheit der RKI zahlen angeht: So wie wir es verstehen, werden die Daten durch Bund, Länder und RKI nach bestem Wissen und Gewissen erhoben. Natürlich kann niemand auf die einzelne Personen genau sagen, wieviele Menschen exakt geimpft sind, denn es kann immer zu Fehlern oder Doppelzählungen kommen.  
Z.B. wurden am 15.6. die Erstimpfungen in Bayern um mehr als 90'000 nach unten korrigiert. Allein die Summe aller bisherigen Moderna-Erstimpfungen sank von einem Tag auf den nächsten um fast 2%. Diagrammdarstellungen werden also hier immer einen Knick haben. Ursache dafür ist laut RKI eine Umstellung im DIM-System (Digitalen Impfquotenmonitoring). Die neueren Zahlen seien zuverlässiger, als die alten.


### Wo finde ich weitere Zahlen?

Das offizielle [Impfdashboard](https://impfdashboard.de/) des RKIs und des BMG bietet einen [Datendownload](https://impfdashboard.de/daten) an. Leider liegen die Zahlen nicht als Zeitreihen und aufgeschlüsselt nach Bundesländern vor.


### Wie oft werden die Daten aktualisiert?

Auf unserer Seite überprüfen wir die Daten alle 20 Minuten auf Veränderungen. Laut Aussage des RKIs werden die Daten werktäglich aktualisiert. Somit kann es sein, dass an Sonnabenden oder Sonntagen keine Aktualisierung stattfindet.


### Was bedeuten die Datumsangaben?

Momentan unterscheiden wir zwei Datumsangaben:

- `date` ist das Datum des Tages, auf den sich die Impfzahlen beziehen.
- `pubDate` bzw. `publication date` sind Datum und Uhrzeit der Veröffentlichung des RKI.

Zwischen diesen beiden Angaben können bis zu 17 Stunden liegen.


### Was mache ich, wenn ich Probleme bei den hier veröffentlichten Daten gefunden habe?

Wir versuchen so neutral wie möglich die RKI-Zahlen aus den Excel-Tabellen in JSON und CSV zu übersetzen, und nur offensichtliche Fehler zu korrigieren.

Falls der Scraper mit Veränderungen an den Excel-Tabellen nicht zurecht kommen oder auf Datenfehler stoßen sollte, bekommen wir automatisch eine Notification und versuchen das Problem so schnell wie möglich zu beheben.

Probleme und Feature-Wünsche können als [neues GitHub Issue](https://github.com/ard-data/2020-rki-impf-archive/issues/new) eingetragen werden.

Wer bei Änderungen oder Problemen direkt per Mail benachrichtigt werden möchte, kann sich [hier auf der Mailingliste anmelden](https://lists.riseup.net/www/subscribe/ard_rki_data). Dort findet man auch ein [Mail-Archiv](https://lists.riseup.net/www/arc/ard_rki_data), um sich die bisherigen Mails anzuschauen.

In Notfällen kann der Autor dieses Projektes auch per [Mail](mailto:rki-scraper@michael-kreil.de) erreicht werden.



## Weitere Links

Andere Projekte, die die RKI-Corona-Impf-Daten sammeln:

- https://github.com/favstats/vaccc19de_dashboard
- https://github.com/n0rdlicht/rki-vaccination-scraper
- https://github.com/mathiasbynens/covid-19-vaccinations-germany
