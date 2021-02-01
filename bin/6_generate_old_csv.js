#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const dataDefinition = require('../config/data_definition.js');



const dirSrc = resolve(__dirname, '../data/2_completed/');
const dirDst = resolve(__dirname, '../data/2_csv/');
fs.mkdirSync(dirDst, {recursive:true});

const metrics = [
	{old:'impfungen_kumulativ', new:'dosen_kumulativ'},
	{old:'indikation_nach_alter', new:'indikation_alter_dosen'},
	{old:'berufliche_indikation', new:'indikation_beruf_dosen'},
	{old:'pflegeheimbewohnerin', new:'indikation_pflegeheim_dosen'},
	{old:'differenz_zum_vortag', new:'dosen_differenz_zum_vortag'},
	{old:'medizinische_indikation', new:'indikation_medizinisch_dosen'},
	{old:'impfungen_pro_1000_einwohner', new:'impf_inzidenz_dosen'},
];
const states = dataDefinition.regions.map(r => r.code).filter(r => r !== 'DE');



const tables = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	states.forEach(state => addObj(data, data.states[state]))
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

	metrics.forEach(entry => {
		let metricOld = entry.old;
		let metricNew = entry.new;

		addCell('metric_'+metricOld, date, 'date', date);
		addCell('metric_'+metricOld, date, 'publication_date', pubDate);

		let value = obj[metricNew];

		addCell('region_'+region, date, metricOld, value);

		addCell('metric_'+metricOld, date, region, value);

		addCell('all', date+'_'+region+'_'+metricOld, 'date', date);
		addCell('all', date+'_'+region+'_'+metricOld, 'publication_date', pubDate);
		addCell('all', date+'_'+region+'_'+metricOld, 'region', region);
		addCell('all', date+'_'+region+'_'+metricOld, 'metric', metricOld);
		addCell('all', date+'_'+region+'_'+metricOld, 'value', value);
	})
}

function addCell(table, key, col, value) {

	if (!tables.has(table)) tables.set(table, {filename:table, entries:new Map(), cols:new Map()});
	table = tables.get(table);

	if (!table.cols.has(col)) table.cols.set(col, {text:col, index:table.cols.size});
	col = table.cols.get(col);

	if (!table.entries.has(key)) table.entries.set(key, {index:table.entries.size, row:[]});

	if ((value === undefined) || (value === null)) return;

	let entry = table.entries.get(key);
	entry.row[col.index] = value;
}
