#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');



const dirSrc = resolve(__dirname, '../data/1_parsed/');
const dirDst = resolve(__dirname, '../data/2_csv/');
const missingEntries = new Set(fs.readFileSync(resolve(__dirname, 'missing_entries.csv'), 'utf8').split('\n').filter(l => /^impfquotenmonitoring-202/.test(l)));

const metrics = [
	'dosen_differenz_zum_vortag',
	'dosen_kumulativ',
	'dosen_biontech_kumulativ',
	'dosen_moderna_kumulativ',
	'impf_quote_erst',
	'impf_quote_voll',
	'indikation_alter_dosen',
	'indikation_alter_erst',
	'indikation_alter_voll',
	'indikation_beruf_dosen',
	'indikation_beruf_erst',
	'indikation_beruf_voll',
	'indikation_medizinisch_dosen',
	'indikation_medizinisch_erst',
	'indikation_medizinisch_voll',
	'indikation_pflegeheim_dosen',
	'indikation_pflegeheim_erst',
	'indikation_pflegeheim_voll',
	'personen_erst_kumulativ',
	'personen_voll_kumulativ',
];
const states = 'BW,BY,BE,BB,HB,HH,HE,MV,NI,NW,RP,SL,SN,ST,SH,TH'.split(',');



const tables = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	Object.values(data.states).forEach(o => addObj(data, o));
	addObj(data, data.germany);
})

Array.from(tables.values()).forEach(table => {
	let fullname = resolve(dirDst, table.filename+'.csv');
	table.cols = Array.from(table.cols.values()).sort((a,b) => a.index - b.index);
	table.entries = Array.from(table.entries.values()).sort((a,b) => a.index - b.index);

	let data = [];
	data.push(table.cols.map(col => col.text));

	table.entries.forEach(entry => {
		// ensure correct number of fiels in every row
		while (entry.row.length < table.cols.length) entry.row.push('');
		
		data.push(entry.row);
	})

	data = data.map(r => r.join(',')+'\n').join('');

	fs.writeFileSync(fullname, data, 'utf8');
})

function addObj(data, obj) {
	let date = data.date;
	let pubDate = data.pubDate;
	let region = obj.code;
	addCell('region_'+region, date, 'date', date);
	addCell('region_'+region, date, 'publication_date', pubDate);

	metrics.forEach(metric => {
		addCell('metric_'+metric, date, 'date', date);
		addCell('metric_'+metric, date, 'publication_date', pubDate);

		checkMissingEntry(obj, metric, region, data.filename);

		let value = obj[metric];

		addCell('region_'+region, date, metric, value);

		addCell('metric_'+metric, date, region, value);

		addCell('all', date+'_'+region+'_'+metric, 'date', date);
		addCell('all', date+'_'+region+'_'+metric, 'publication_date', pubDate);
		addCell('all', date+'_'+region+'_'+metric, 'region', region);
		addCell('all', date+'_'+region+'_'+metric, 'metric', metric);
		addCell('all', date+'_'+region+'_'+metric, 'value', value);
	})
}

function addCell(table, key, col, value) {
	if ((value === undefined) || (value === null)) return;

	if (!tables.has(table)) tables.set(table, {filename:table, entries:new Map(), cols:new Map()});
	table = tables.get(table);

	if (!table.cols.has(col)) table.cols.set(col, {text:col, index:table.cols.size});
	col = table.cols.get(col);

	if (!table.entries.has(key)) table.entries.set(key, {index:table.entries.size, row:[]});
	let entry = table.entries.get(key);
	entry.row[col.index] = value;
}

function checkMissingEntry(obj, metric, region, filename) {
	let value = obj[metric];
	if (Number.isFinite(value)) return false;

	let entry = [filename, region, metric];
	let key = entry.join(',');

	if (missingEntries.has(key)) return false;


	console.log(value+'\t'+key);
	/*
		console.log('obj', obj);
		console.log('date', date);
		console.log('region', region);
		console.log('metric', metric);
		throw Error('missing value');
	*/
}


