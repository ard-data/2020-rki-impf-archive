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
	const dimensionSumsLookup = new Map();
	const dimensionValuesLookup = new Map();
	dataDefinition.dimensions.forEach(d => {
		let list = [];
		dimensionSumsLookup.set(d.name, list);
		dimensionValuesLookup.set(d.name, d.elements);
		if (d.sums) return d.sums.forEach(entry => list.push(entry))
		list.push(d.elements);
	});
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
			setValue('dosen_biontech_kumulativ', entry.dosen_kumulativ);
			setValue('indikation_alter_voll', 0);
			setValue('indikation_beruf_voll', 0);
			setValue('indikation_medizinisch_voll', 0);
			setValue('indikation_pflegeheim_voll', 0);
			setValue('personen_erst_biontech_kumulativ', entry.dosen_biontech_kumulativ);
			setValue('personen_erst_moderna_kumulativ', 0);
			setValue('personen_voll_kumulativ', 0);

			setValue('indikation_alter_erst', entry.indikation_alter_dosen);
			setValue('indikation_beruf_erst', entry.indikation_beruf_dosen);
			setValue('indikation_medizinisch_erst', entry.indikation_medizinisch_dosen);
			setValue('indikation_pflegeheim_erst', entry.indikation_pflegeheim_dosen);
		}
		if (pubDate < '2021-02-04') {
			setValue('personen_voll_biontech_kumulativ', entry.personen_voll_kumulativ);
			setValue('personen_voll_moderna_kumulativ', 0);
		}
		if (pubDate < '2021-02-09') {
			setValue('personen_erst_astrazeneca_kumulativ', 0);
		}
		if (pubDate < '2021-03-12') {
			setValue('personen_voll_astrazeneca_kumulativ', 0);
		}
		if (pubDate < '2021-04-08') {
			setValue('indikation_alter_min1', entry.indikation_alter_erst);
			setValue('indikation_beruf_min1', entry.indikation_beruf_erst);
			setValue('indikation_medizinisch_min1', entry.indikation_medizinisch_erst);
			setValue('indikation_pflegeheim_min1', entry.indikation_pflegeheim_erst);
			setValue('indikation_alter_zweit', entry.indikation_alter_voll);
			setValue('indikation_beruf_zweit', entry.indikation_beruf_voll);
			setValue('indikation_medizinisch_zweit', entry.indikation_medizinisch_voll);
			setValue('indikation_pflegeheim_zweit', entry.indikation_pflegeheim_voll);
		}
		if (pubDate < '2021-04-27') {
			setValue('dosen_janssen_kumulativ', 0);
			setValue('dosen_janssen_kumulativ_impfstelle_zentral', 0);
			setValue('personen_erst_janssen_kumulativ', 0);
			setValue('personen_voll_janssen_kumulativ', 0);
			setValue('personen_voll_janssen_kumulativ_impfstelle_zentral', 0);

			setValue('personen_zweit_kumulativ_impfstelle_aerzte', entry.personen_voll_kumulativ_impfstelle_aerzte);
			setValue('personen_zweit_kumulativ_impfstelle_zentral', entry.personen_voll_kumulativ_impfstelle_zentral);
		}
		if (pubDate < '2021-04-30') {
			setValue('dosen_janssen_kumulativ_impfstelle_aerzte', 0);
			setValue('personen_voll_janssen_kumulativ_impfstelle_aerzte', 0);
		}

		// Janssen gibt es nur als min1 und voll
		setValue('personen_erst_janssen_kumulativ', 0);
		setValue('personen_erst_janssen_kumulativ_impfstelle_aerzte', 0);
		setValue('personen_erst_janssen_kumulativ_impfstelle_zentral', 0);
		setValue('personen_zweit_janssen_kumulativ', 0);
		setValue('personen_zweit_janssen_kumulativ_impfstelle_aerzte', 0);
		setValue('personen_zweit_janssen_kumulativ_impfstelle_zentral', 0);

		setValue('personen_auffr_novavax_kumulativ', 0);

		// RKI möchte vorerst keine Astrazeneca-Auffrischungsimpfungen publizieren
		setValue(
			'personen_auffr_astrazeneca_kumulativ',
			entry.personen_auffr_kumulativ
				- entry.personen_auffr_biontech_kumulativ
				- entry.personen_auffr_janssen_kumulativ
				- entry.personen_auffr_moderna_kumulativ
				- entry.personen_auffr_novavax_kumulativ
		);

		// Berechne fehlende Werte
		let checkChanged;
		do {
			checkChanged = false;
			checks.forEach(check => {
				let value = check.calc(entry, r.pop);

				// Wert konnte nicht berechnet werden.
				if (!Number.isFinite(value)) return;

				// Wert gibt es noch nicht, also übernehmen.
				if (!Number.isFinite(entry[check.key])) {
					entry[check.key] = value;
					checkChanged = true;
					return;	
				}

				// Wert gibt es schon und ist identisch: Alles in Ordnung
				if (value === entry[check.key]) return;

				// Es gibt eine Differenz zwischen berechnetem und vorhandenem Wert.

				// Ist das Problem bekannt?
				let problemHash = [filename, r.code, check.key].join(',').trim();
				if (ignoreProblems.has(problemHash)) return;

				console.log('entry', sortObject(entry));
				console.log('check', check);
				console.log('problemHash:', problemHash);
				console.log('value', value);
				console.log('entry[check.key]', entry[check.key]);
				throw Error('value !== entry[check.key]');
			})
		} while (checkChanged);

		// überprüfe, ob alle Werte gesetzt sind
		dataDefinition.parameters.forEach(parameter => {
			if (parameter.optional) return; // check nicht notwendig

			let slug = parameter.slug;
			let value = entry[slug];

			if (Number.isFinite(value)) return;

			let missingHash = [filename, r.code, slug].join(',').trim();
			if (knownMissingHashes.has(missingHash)) return;

			console.dir(checks, {maxArrayLength:1000});
			console.log('entry', sortObject(entry));
			console.log('slug', slug);
			console.log('missingHash: ', missingHash);
			throw Error('missing value');
		})



		function setValue(key, value) {
			if (!Number.isFinite(value)) return;
			if (entry[key] === value) return;
			if (!Number.isFinite(entry[key])) return entry[key] = value;
			console.log('key', key);
			console.log('old value', entry[key]);
			console.log('new value', value);
			throw Error('do not overwrite values');
		}

		function sortObject(obj) {
			return Object.fromEntries(Object.keys(obj).sort().map(key => [key,obj[key]]));
		}
	})

	function getAllChecks(pubDate) {
		let checks = [];

		if (pubDate < '2021-04-08') {
			generateSum('dosis','hersteller'); // Dosen = Erstimpfung + Zweitimpfung … für "alles" und jeden Hersteller
			generateSum('hersteller','dosis'); // Impfungen = Impfungen BionTech + Impfungen Moderna … für Dosen, Erst- und Zweitimpfung.
			generateSum('dosis','indikation'); // Dosen = Erstimpfung + Zweitimpfung … für "alles" und jede Indikation
		} else if (pubDate < '2021-06-07') {
			generateSum('hersteller','dosis,impfstelle');
			generateSum('impfstelle','dosis,hersteller');
			generateSum('dosis','hersteller,impfstelle');
			generateSum('dosis','alter,impfstelle');
			generateSum('impfstelle','dosis,alter');
		} else {
			generateSum('hersteller','dosis');
			generateSum('dosis','hersteller');
			generateSum('dosis','alter');
		}

		generateEqualDosis('zweit', 'voll', 'biontech,astrazeneca,moderna,novavax');
		generateEqualDosis('erst', 'min1', 'biontech,astrazeneca,moderna,novavax');
		generateEqualDosis('min1', 'voll', 'janssen');

		// Jetzt noch Checks, um Impfquote und Impfinzidenz zu berechnen:
		checks.push({key:'impf_quote_dosen',    calc:(obj,pop) => Math.round( 1000*obj.dosen_kumulativ         /pop)/10, debug:'impf_quote_dosen = 100*dosen_kumulativ/pop'});
		checks.push({key:'impf_quote_erst',     calc:(obj,pop) => Math.round( 1000*obj.personen_erst_kumulativ /pop)/10, debug:'impf_quote_erst = 100*personen_erst_kumulativ/pop'});
		checks.push({key:'impf_quote_zweit',    calc:(obj,pop) => Math.round( 1000*obj.personen_zweit_kumulativ/pop)/10, debug:'impf_quote_zweit = 100*personen_zweit_kumulativ/pop'});
		checks.push({key:'impf_quote_min1',     calc:(obj,pop) => Math.round( 1000*obj.personen_min1_kumulativ /pop)/10, debug:'impf_quote_min1 = 100*personen_min1_kumulativ/pop'});
		checks.push({key:'impf_quote_voll',     calc:(obj,pop) => Math.round( 1000*obj.personen_voll_kumulativ /pop)/10, debug:'impf_quote_voll = 100*personen_voll_kumulativ/pop'});
		checks.push({key:'impf_quote_auffr',    calc:(obj,pop) => Math.round( 1000*obj.personen_auffr_kumulativ/pop)/10, debug:'impf_quote_auffr = 100*personen_auffr_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_dosen', calc:(obj,pop) => Math.round(10000*obj.dosen_kumulativ         /pop)/10, debug:'impf_inzidenz_dosen = 1000*dosen_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_erst',  calc:(obj,pop) => Math.round(10000*obj.personen_erst_kumulativ /pop)/10, debug:'impf_inzidenz_erst = 1000*personen_erst_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_zweit', calc:(obj,pop) => Math.round(10000*obj.personen_zweit_kumulativ/pop)/10, debug:'impf_inzidenz_zweit = 1000*personen_zweit_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_min1',  calc:(obj,pop) => Math.round(10000*obj.personen_min1_kumulativ /pop)/10, debug:'impf_inzidenz_min1 = 1000*personen_min1_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_voll',  calc:(obj,pop) => Math.round(10000*obj.personen_voll_kumulativ /pop)/10, debug:'impf_inzidenz_voll = 1000*personen_voll_kumulativ/pop'});
		checks.push({key:'impf_inzidenz_auffr', calc:(obj,pop) => Math.round(10000*obj.personen_auffr_kumulativ/pop)/10, debug:'impf_inzidenz_auffr = 1000*personen_auffr_kumulativ/pop'});

		checks.forEach((c,i) => c.order = (c.level || 100) * 1e4 + i)
		checks.sort((a,b) => a.order - b.order);

		return checks;

		function generateEqualDosis(dosis1, dosis2, herstellerList) {
			herstellerList.split(',').forEach(hersteller => {
				dataDefinition.parameters.forEach(p => {
					if (p.cell.hersteller !== hersteller) return;
					if (p.cell.dosis === dosis1) return add(dosis2,20);
					if (p.cell.dosis === dosis2) return add(dosis1,21);
					function add(dosis, level) {
						let slug0 = p.slug;
						let slug1 = dataDefinition.getSlug(Object.assign(p.cell, {dosis}));
						let check = {
							key: slug0,
							calc: obj => obj[slug1],
							debug: slug0+' = '+slug1,
							level:level,
						};
						//console.log(check);
						checks.push(check);
					}
				})
			})
		}

		function generateSum(sumKey, whereKeys) {
			// so my mental model is SQL
			// sumKey is the field name that should be summed up
			// whereKey defines the filter

			// generate all combinations of values for every "where" key
			let whereEntries = [{level:50}];
			whereKeys.split(',').forEach(whereKey => {
				let newWhereEntries = [];
				dimensionValuesLookup.get(whereKey).forEach((whereVal,i) => {
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
				dimensionSumsLookup.get(sumKey).forEach(valueList => {
					let sumValue = valueList[0];
					let values = valueList.slice(1);

					let cell = {};
					cell = Object.assign(cell, cell0);
					cell = Object.assign(cell, whereEntry);
					cell[sumKey] = sumValue;
					let slug0 = dataDefinition.getSlug(cell);

					let slugs = values.map(value => {
						cell[sumKey] = value;
						return dataDefinition.getSlug(cell);
					})
					checks.push({
						key:slug0,
						calc:obj => slugs.reduce((sum, slug) => sum + obj[slug], 0),
						debug:slug0+' = '+slugs.join(' + ')+'   '+JSON.stringify(whereEntry),
						level:whereEntry.level,
					});
				})
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

