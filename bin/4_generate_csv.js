#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');



const dirSrc = resolve(__dirname, '../data/1_parsed/');
const dirDst = resolve(__dirname, '../data/2_csv/');

const metrics = [
	'impfungen_kumulativ',
	'differenz_zum_vortag',
	'indikation_nach_alter',
	'berufliche_indikation',
	'medizinische_indikation',
	'pflegeheimbewohnerin',
];
const states = 'BW,BY,BE,BB,HB,HH,HE,MV,NI,NW,RP,SL,SN,ST,SH,TH'.split(',');



const tables = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	Object.values(data.states).forEach(o => addObj(data.date, o));
	addObj(data.date, data.germany);
})

Array.from(tables.values()).forEach(table => {
	let fullname = resolve(dirDst, table.filename+'.csv');
	table.cols = Array.from(table.cols.values()).sort((a,b) => a.index - b.index);
	table.entries = Array.from(table.entries.values()).sort((a,b) => a.index - b.index);

	let data = [];
	data.push(table.cols.map(col => col.text));

	table.entries.forEach(entry => {
		data.push(entry.row);
	})

	data = data.map(r => r.join(',')).join('\n');

	fs.writeFileSync(fullname, data, 'utf8');
})

function addObj(date, obj) {
	let region = obj.code;
	addCell('region_'+region, date, 'date', date);

	metrics.forEach(metric => {
		addCell('metric_'+metric, date, 'date', date);

		let value = obj[metric];
		addCell('region_'+region, date, metric, value);

		addCell('metric_'+metric, date, region, value);

		addCell('all', date+'_'+region+'_'+metric, 'date', date);
		addCell('all', date+'_'+region+'_'+metric, 'region', region);
		addCell('all', date+'_'+region+'_'+metric, 'metric', metric);
		addCell('all', date+'_'+region+'_'+metric, 'value', value);
	})
}

function addCell(table, key, col, value) {
	if (!tables.has(table)) tables.set(table, {filename:table, entries:new Map(), cols:new Map()});
	table = tables.get(table);

	if (!table.cols.has(col)) table.cols.set(col, {text:col, index:table.cols.size});
	col = table.cols.get(col);

	if (!table.entries.has(key)) table.entries.set(key, {index:table.entries.size, row:[]});
	let entry = table.entries.get(key);
	entry.row[col.index] = value;
}




