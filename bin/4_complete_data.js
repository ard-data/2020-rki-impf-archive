#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const DataDefinition = require('../config/data_definition.js');



const dirSrc = resolve(__dirname, '../data/1_parsed/');
const dirDst = resolve(__dirname, '../data/2_completed/');
fs.mkdirSync(dirDst, {recursive:true});

const knownMissingHashes = new Set(
	fs.readFileSync('../config/known_missing_entries.csv', 'utf8')
		.split('\n')
		.filter(l => l.startsWith('impf'))
);
const ignoreProblems = new Set(
	fs.readFileSync('../config/ignore_problems.csv', 'utf8')
		.split('\n')
		.filter(l => l.startsWith('impf'))
);
const fixProblems = new Map(
	fs.readFileSync('../config/fix_problems.csv', 'utf8')
		.split('\n')
		.filter(l => l.startsWith('impf'))
		.map(l => {l = l.split('\t'); return [l[0],JSON.parse(l[1])]})
);





fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/^impfquotenmonitoring-202.*\.json$/.test(filename)) return;

	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename);

	if (fs.existsSync(fullnameDst)) return;

	console.log('parse '+filename);

	let data = JSON.parse(fs.readFileSync(fullnameSrc));

	completeData(data, filename);
	keySorter(data);

	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));
})







function completeData(data, filename) {
	let pubDate = data.pubDate.slice(0,10);

	const dataDefinition = DataDefinition(pubDate);
	const regions = dataDefinition.regions;
	const dimLookup = Object.fromEntries(dataDefinition.dimensions.map(d => [d.name, d.elements])); Object.freeze(dimLookup);
	const cell0 = Object.fromEntries(dataDefinition.dimensions.map(d => [d.name, d.elements[0]]));


	const checks = getAllChecks(pubDate);

	regions.forEach(r => {
		let entry = (r.code === 'DE') ? data.germany : data.states[r.code];

		Object.keys(entry).forEach(key => {
			if (entry[key] === null) entry[key] = NaN;
		});

		// müssen die Daten repariert werden?
		let hash = filename+','+r.code;
		if (fixProblems.has(hash)) Object.assign(entry, fixProblems.get(hash));

		// Setze fehlende Werte
		// Wenn man einen Wert setzt, der bereits einen anderen Wert hat,
		// bricht das Script mit einem Fehler ab.
		if (pubDate < '2021-01-17') {
			setValue('personen_voll_kumulativ', 0);
			setValue('personen_erst_kumulativ', entry.dosen_kumulativ);
			setValue('dosen_erst_biontech_kumulativ', entry.personen_erst_kumulativ);
			setValue('dosen_erst_moderna_kumulativ', 0);
			setValue('indikation_alter_voll', 0);
			setValue('indikation_alter_erst', entry.indikation_alter_dosen);
			setValue('indikation_beruf_voll', 0);
			setValue('indikation_beruf_erst', entry.indikation_beruf_dosen);
			setValue('indikation_medizinisch_voll', 0);
			setValue('indikation_medizinisch_erst', entry.indikation_medizinisch_dosen);
			setValue('indikation_pflegeheim_voll', 0);
			setValue('indikation_pflegeheim_erst', entry.indikation_pflegeheim_dosen);
		}
		if (pubDate < '2021-02-04') {
			setValue('dosen_voll_biontech_kumulativ', entry.personen_voll_kumulativ);
			setValue('dosen_voll_moderna_kumulativ', 0);
		}
		if (pubDate < '2021-02-09') {
			setValue('dosen_erst_astrazeneca_kumulativ', 0);
		}
		if (pubDate < '2021-03-12') {
			setValue('dosen_voll_astrazeneca_kumulativ', 0);
		}
		if (pubDate >= '2021-04-08') {
		}
		


		// Berechne fehlende Werte
		checks.forEach(check => {
			let value = check.calc(entry, r.pop);

			// Wert gibt es noch nicht, also übernehmen.
			if (!Number.isFinite(entry[check.key])) {
				entry[check.key] = value;
				return;	
			}

			// Wert konnte nicht berechnet werden.
			if (!Number.isFinite(value)) return;

			// Wert gibt es schon und ist identisch: Alles in Ordnung
			if (value.toFixed(6) === entry[check.key].toFixed(6)) return;

			// Es gibt eine Differenz zwischen berechnetem und vorhandenem Wert.

			// Ist das Problem bekannt?
			let problemHash = [filename, r.code, check.key].join(',').trim();
			if (ignoreProblems.has(problemHash)) return;

			console.log('entry', entry);
			console.log('check', check);
			console.log('problemHash:', problemHash);
			console.log('value', value);
			console.log('entry[check.key]', entry[check.key]);
			throw Error('value !== entry[check.key]');
		})

		// überprüfe, ob alle Werte gesetzt sind
		dataDefinition.parameters.forEach(parameter => {
			if (parameter.optional) return; // check nicht notwendig

			let slug = parameter.slug;
			let value = entry[slug];

			if (Number.isFinite(value)) return;

			let missingHash = [filename, r.code, slug].join(',').trim();
			if (knownMissingHashes.has(missingHash)) return;

			console.log('entry', entry);
			console.log('slug', slug);
			console.log('missingHash: ', missingHash);
			throw Error('missing value');
		})



		function setValue(key, value) {
			if (entry[key] === value) return;
			if (!Number.isFinite(entry[key])) return entry[key] = value;
			console.log('key', key);
			console.log('value', value);
			throw Error();
		}
	})

	function getAllChecks(pubDate) {
		let checks = [];

		if (pubDate < '2021-04-08') {
			generateSum('dosis','hersteller'); // Dosen = Erstimpfung + Zweitimpfung … für "alles" und jeden Hersteller
			generateSum('hersteller','dosis'); // Impfungen = Impfungen BionTech + Impfungen Moderna … für Dosen, Erst- und Zweitimpfung.
			generateSum('dosis','indikation'); // Dosen = Erstimpfung + Zweitimpfung … für "alles" und jede Indikation
		} else {
			generateSum('hersteller','dosis,impfstelle');
			generateSum('impfstelle','dosis,hersteller');
			generateSum('dosis','hersteller,impfstelle');
			generateSum('dosis','alter,impfstelle');
			//generateSum('alter','dosis,impfstelle');
			generateSum('impfstelle','dosis,alter');
		}

		// Jetzt noch Checks, um Impfquote und Impfinzidenz zu berechnen:
		checks.push({key:'impf_quote_dosen',    calc:(obj,pop) =>  100*obj.dosen_kumulativ        /pop, debug:'impf_quote_dosen = 100*dosen_kumulativ/pop'});
		checks.push({key:'impf_quote_erst',     calc:(obj,pop) =>  100*obj.personen_erst_kumulativ/pop, debug:'impf_quote_erst = 100*personen_erst_kumulativ/pop'});
		checks.push({key:'impf_quote_voll',     calc:(obj,pop) =>  100*obj.personen_voll_kumulativ/pop, debug:'impf_quote_voll = 100*personen_voll_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_dosen', calc:(obj,pop) => 1000*obj.dosen_kumulativ        /pop, debug:'impf_inzidenz_dosen = 1000*dosen_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_erst',  calc:(obj,pop) => 1000*obj.personen_erst_kumulativ/pop, debug:'impf_inzidenz_erst = 1000*personen_erst_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_voll',  calc:(obj,pop) => 1000*obj.personen_voll_kumulativ/pop, debug:'impf_inzidenz_voll = 1000*personen_voll_kumulativ/pop'});

		checks.forEach((c,i) => c.order = (c.level || 100) * 1e4 + i)
		checks.sort((a,b) => a.order - b.order);

		return checks;

		function generateSum(sumKey, whereKeys) {
			// so my mental model is SQL
			// sumKey is the field name that should be summed up
			// whereKey defines the filter

			// generate all combinations of values for every "where" key
			let whereEntries = [{level:50}];
			whereKeys.split(',').forEach(whereKey => {
				let newWhereEntries = [];
				dimLookup[whereKey].forEach((whereVal,i) => {
					whereEntries.forEach(e => {
						e = Object.assign({},e);
						if (i > 0) e.level--;
						e[whereKey] = whereVal; 
						newWhereEntries.push(e);
					})
				})
				whereEntries = newWhereEntries;
			})

			whereEntries.forEach(whereEntry => {
				let cell = {};
				cell = Object.assign(cell, cell0);
				cell = Object.assign(cell, whereEntry);
				let slug0 = dataDefinition.getSlug(cell);
				let slugs = dimLookup[sumKey].slice(1).map(sumValue => {
					cell[sumKey] = sumValue;
					return dataDefinition.getSlug(cell);
				})
				checks.push({
					key:slug0,
					calc:obj => slugs.reduce((sum, slug) => sum + obj[slug], 0),
					debug:slug0+' = '+slugs.join(' + ')+'   '+JSON.stringify(whereEntry),
					level:whereEntry.level,
				});
			})
		}
	}

}

function keySorter(obj) {
	if (Array.isArray(obj)) return obj.forEach(keySorter);
	if (typeof obj !== 'object') return;
	if (!obj) return;
	let entries = Array.from(Object.entries(obj));
	entries.sort((a,b) => a[0] < b[0] ? -1 : 1);
	entries.forEach(entry => {
		delete obj[entry[0]];
		obj[entry[0]] = entry[1];
		keySorter(entry[1]);
	})
}

