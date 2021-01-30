#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const validator = require('../lib/validator.js');



const dirSrc = resolve(__dirname, '../data/1_parsed/');
const dirDst = resolve(__dirname, '../data/2_completed/');

const regions = [
	{code:'BW',pop:11100394},
	{code:'BY',pop:13124737},
	{code:'BE',pop: 3669491},
	{code:'BB',pop: 2521893},
	{code:'HB',pop:  681202},
	{code:'HH',pop: 1847253},
	{code:'HE',pop: 6288080},
	{code:'MV',pop: 1608138},
	{code:'NI',pop: 7993608},
	{code:'NW',pop:17947221},
	{code:'RP',pop: 4093903},
	{code:'SL',pop:  986887},
	{code:'SN',pop: 4071971},
	{code:'ST',pop: 2194782},
	{code:'SH',pop: 2903773},
	{code:'TH',pop: 2133378},
	{code:'DE',pop:83166711},
]

const dimLookup = Object.fromEntries(validator.dimensions.map(d => [d.name, d.elements])); Object.freeze(dimLookup);
const cell0Def = validator.dimensions.map(d => ({key:d.name, value:d.elements[0]}));
const checks = getAllChecks();

const knownMissingHashes = new Set(fs.readFileSync('../config/known_missing_entries.csv', 'utf8').split('\n').filter(l => l.startsWith('impf')));
const knownProblemHashes = new Set(fs.readFileSync('../config/known_problems.csv', 'utf8').split('\n').filter(l => l.startsWith('impf')));





fs.readdirSync(dirSrc).sort((a,b) => a < b ? 1 : -1).forEach(filename => {
	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename);

	if (fs.existsSync(fullnameDst)) return;

	console.log('complete '+filename);

	let data = JSON.parse(fs.readFileSync(fullnameSrc));

	completeData(data, filename);

	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));
})







function completeData(data, filename) {
	let pubDate = data.pubDate.slice(0,10);

	regions.forEach(r => {
		let entry = (r.code === 'DE') ? data.germany : data.states[r.code];



		// Setze fehlende Werte
		if (pubDate <= '2021-01-16') {
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
		setValue('dosen_voll_biontech_kumulativ', entry.personen_voll_kumulativ);
		setValue('dosen_voll_moderna_kumulativ', 0);
		


		// Berechne fehlende Werte
		checks.forEach(check => {
			let value = check.calc(entry, r.pop);

			// Wert gibt es schon und ist identisch: Alles in Ordnung
			if (value === entry[check.key]) return;

			// Wert konnte nicht berechnet werden.
			if (!Number.isFinite(value)) {
				console.log('entry', entry);
				console.log('pubDate', pubDate);
				throw Error('Can not calc: '+check.debug);
			}

			// Wert gibt es noch nicht, also übernehmen.
			if (!Number.isFinite(entry[check.key])) {
				entry[check.key] = value;
				return;	
			}

			// Es gibt eine Differenz zwischen berechnetem und vorhandenem Wert.

			// Ist das Problem bekannt?
			let problemHash = [filename, r.code, check.key].join(',').trim();
			if (knownProblemHashes.has(problemHash)) return;

			console.log('entry', entry);
			console.log('check', check);
			console.log('problemHash:', problemHash);
			console.log('value', value);
			console.log('entry[check.key]', entry[check.key]);
			throw Error('value !== entry[check.key]');
		})

		// check values
		validator.parameters.forEach(parameter => {
			if (parameter.cell.kumulativ === 'differenz') return; // check nicht notwendig

			let slug = parameter.slug;
			let value = entry[slug];

			if (Number.isFinite(value))  return;

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
			throw Error();
		}
	})
}

function getAllChecks() {
	let checks = [];

	generateSum('dosis','hersteller');
	generateSum('hersteller','dosis');
	generateSum('dosis','indikation');

	checks.push({key:'impfquote_dosen',    calc:(obj,pop) =>  100*obj.dosen_kumulativ/pop,         debug:'impfquote_dosen = 100*dosen_kumulativ/pop'});
	checks.push({key:'impfquote_erst',     calc:(obj,pop) =>  100*obj.personen_erst_kumulativ/pop, debug:'impfquote_erst = 100*personen_erst_kumulativ/pop'});
	checks.push({key:'impfquote_voll',     calc:(obj,pop) =>  100*obj.personen_voll_kumulativ/pop, debug:'impfquote_voll = 100*personen_voll_kumulativ/pop'});
	checks.push({key:'impfinzidenz_dosen', calc:(obj,pop) => 1000*obj.dosen_kumulativ/pop,         debug:'impfinzidenz_dosen = 1000*dosen_kumulativ/pop'});
	checks.push({key:'impfinzidenz_erst',  calc:(obj,pop) => 1000*obj.personen_erst_kumulativ/pop, debug:'impfinzidenz_erst = 1000*personen_erst_kumulativ/pop'});
	checks.push({key:'impfinzidenz_voll',  calc:(obj,pop) => 1000*obj.personen_voll_kumulativ/pop, debug:'impfinzidenz_voll = 1000*personen_voll_kumulativ/pop'});

	return checks;

	function generateSum(sumKey, forKey) {
		dimLookup[forKey].forEach(forValue => {
			let cell = {};
			cell0Def.forEach(e => cell[e.key] = e.value);
			cell[forKey] = forValue;
			let slug0 = validator.getSlug(cell);
			let slugs = dimLookup[sumKey].slice(1).map(sumValue => {
				cell[sumKey] = sumValue;
				return validator.getSlug(cell);
			})
			checks.push({key:slug0, calc:obj => slugs.reduce((sum, slug) => sum + obj[slug], 0), debug:slug0+' = '+slugs.join(' + ')});
		})
	}
}

