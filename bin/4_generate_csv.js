#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');



const dirSrc = resolve(__dirname, '../data/1_parsed/');
const dirDst = resolve(__dirname, '../data/2_csv/');

const metrics = [
	{key:'impfungen_kumulativ'},
	{key:'differenz_zum_vortag'},
	{key:'indikation_nach_alter'},
	{key:'berufliche_indikation'},
	{key:'medizinische_indikation'},
	{key:'pflegeheimbewohnerin'},
	{key:'impfungen_pro_1000_einwohner'},
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
		let key = metric.key;
		addCell('metric_'+key, date, 'date', date);
		addCell('metric_'+key, date, 'publication_date', pubDate);

		let value = obj[key];
		if (!value) value = handleMissingValue(date, obj, key);

		addCell('region_'+region, date, key, value);

		addCell('metric_'+key, date, region, value);

		addCell('all', date+'_'+region+'_'+key, 'date', date);
		addCell('all', date+'_'+region+'_'+key, 'publication_date', pubDate);
		addCell('all', date+'_'+region+'_'+key, 'region', region);
		addCell('all', date+'_'+region+'_'+key, 'metric', key);
		addCell('all', date+'_'+region+'_'+key, 'value', value);
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

function handleMissingValue(date, obj, key) {
	if (obj[key] === 0) return 0;

	if (key === 'differenz_zum_vortag') {
		if (date < '2021-01-12') return null;
	}
	if (key === 'medizinische_indikation') {
		if (date < '2021-01-08') return null;
		if (obj.code === 'NW') return null;
		if (obj.code === 'SL') return null;
	}
	if (key === 'pflegeheimbewohnerin') {
		if (date < '2021-01-01') return null;
	}
	if (key === 'indikation_nach_alter') {
		if (obj.code === 'NW') return null;
		if (obj.code === 'RP' && date < '2021-01-08') return null;
		if (obj.code === 'MV' && date < '2020-12-29') return null;
	}
	if (key === 'impfungen_pro_1000_einwohner') {
		if (date < '2021-01-04') return null;
	}

	if (key === 'impfungen_kumulativ') return check(sum('impfungen_kumulativ_erstimpfung,impfungen_kumulativ_zweitimpfung'));
	if (key === 'differenz_zum_vortag') {
		let value = sum('differenz_zum_vortag_erstimpfung,differenz_zum_vortag_zweitimpfung');
		if (!value && date === '2021-01-18') return null;
		return check(value);
	}
	if (key === 'indikation_nach_alter') return check(sum('indikation_nach_alter_erstimpfung,indikation_nach_alter_zweitimpfung'));
	if (key === 'berufliche_indikation') return check(sum('berufliche_indikation_erstimpfung,berufliche_indikation_zweitimpfung'));
	if (key === 'medizinische_indikation') return check(sum('medizinische_indikation_erstimpfung,medizinische_indikation_zweitimpfung'));
	if (key === 'pflegeheimbewohnerin') return check(sum('pflegeheimbewohnerin_erstimpfung,pflegeheimbewohnerin_zweitimpfung'));
	if (key === 'impfungen_pro_1000_einwohner') {
		let value = sum('impfungen_prozent_erstimpfung,impfungen_prozent_zweitimpfung');
		if (!value) return null;
		return value * 10;
	}

	throw Error('i don\'t think that i can handle this right now');

	function sum(keys) {
		let value = 0;
		keys.split(',').forEach(key => value += obj[key]);
		return value;
	}
	function check(value) {
		if (!value && value !== 0) {
			console.log(date, obj.code, key);
			console.log(obj);
			throw Error('failed check');
		}
		return value;
	}
}

