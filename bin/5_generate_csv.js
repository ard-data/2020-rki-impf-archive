#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const dataDefinition = require('../config/data_definition.js')('2021-06-07');



const dirSrc = resolve(__dirname, '../data/2_completed/');
const dirDst = resolve(__dirname, '../data/9_csv_v3/');
fs.mkdirSync(dirDst, {recursive:true});

const parameters = dataDefinition.parameters;
parameters.forEach(p => p.definedFor = new Set());
const definedFor = new Set();
const states  = dataDefinition.regions.map(r => r.code).filter(r => r !== 'DE');

const htmlStyle = ['<style>',
	'body { font-family:sans-serif }',
	'a { color:inherit !important }',
	'p { text-align:center; margin:20px; font-size:14px }',
	'table { margin:50px auto; border-spacing:0; font-size:14px }',
	'th, td { padding:1px 10px; border-left:1px solid #aaa }',
	'td { text-align:right }',
	'td:first-child { border-left:none; text-align:left }',
	'th:first-child { border-left:none }',
	'tr:hover td { background:#eee }',
	'</style>',
].join('\n');


// Alle JSON-Dateien durchgehen und die Werte hinzufügen.
let tables = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	states.forEach(state => addObj(data, data.states[state]))
	addObj(data, data.germany);
})

// Alle Tabellen speichern
tables = Array.from(tables.values());
tables = tables.filter(t => t.valueCount > 0);

tables.forEach(table => {
	let fullname = resolve(dirDst, table.filename);

	table.cols = Array.from(table.cols.values()).sort((a,b) => a.index - b.index);
	table.entries = Array.from(table.entries.values()).sort((a,b) => a.index - b.index);

	let data = [];
	data.push(table.cols.map(col => col.text));

	table.entries.forEach(entry => {
		// ensure correct number of fields in every row
		while (entry.row.length < table.cols.length) entry.row.push('');
		
		data.push(entry.row);
	})

	data = data.map(r => r.join(',')+'\n').join('');

	fs.writeFileSync(fullname, data, 'utf8');
})

// Ein Tabellen-Index als HTML erzeugen und speichern.
generateFileIndex(tables);

// Eine Liste aller Paramter als HTML erzeugen und speichern.
generateParameterIndex();



function addObj(data, obj) {
	let date = data.date;

	let pubDate = data.pubDate;
	let region = obj.code;
	addCell('region_'+region, date, 'date', date);
	addCell('region_'+region, date, 'publication_date', pubDate);

	definedFor.add(date+'_'+region);

	parameters.forEach(parameter => {
		let metric = parameter.slug;

		addCell('metric_'+metric, date, 'date', date);
		addCell('metric_'+metric, date, 'publication_date', pubDate);

		let value = obj[metric];
		if (Number.isFinite(value)) parameter.definedFor.add(date+'_'+region);

		addCell('region_'+region, date, metric, value, true);

		addCell('metric_'+metric, date, region, value, true);

		addCell('all', date+'_'+region+'_'+metric, 'date', date);
		addCell('all', date+'_'+region+'_'+metric, 'publication_date', pubDate);
		addCell('all', date+'_'+region+'_'+metric, 'region', region);
		addCell('all', date+'_'+region+'_'+metric, 'metric', metric);
		addCell('all', date+'_'+region+'_'+metric, 'value', value, true);
	})
}

function addCell(tableName, key, col, value, isNumber) {

	if (!tables.has(tableName)) tables.set(tableName, {filename:tableName+'.csv', entries:new Map(), cols:new Map(), valueCount:0});
	let table = tables.get(tableName);

	if (!table.cols.has(col)) table.cols.set(col, {text:col, index:table.cols.size, isNumber});
	col = table.cols.get(col);

	if (!table.entries.has(key)) table.entries.set(key, {index:table.entries.size, row:[]});

	if (!Number.isFinite(value)) return;

	let entry = table.entries.get(key);

	if (isNumber && (!Number.isFinite(entry.row[col.index]))) table.valueCount++;

	entry.row[col.index] = value;
}

function generateFileIndex(files) {
	let html = [];
	html.push('<html>')
	html.push(`<head>${htmlStyle}</head>`)
	html.push('<body>')
	html.push('<table>')
	html.push('<thead><tr><th>Dateiname</th><th>Spalten mit Werten</th><th>Zeilen mit Werten</th><th>Vollständigkeit</th></tr></thead>')
	html.push('<tbody>')

	files.sort((a,b) => a.filename < b.filename ? -1 : 1);
	files.forEach(f => {
		let name = f.filename;
		let cols = f.cols.filter(c => c.isNumber);
		let rows = f.entries;
		let completeness = f.valueCount/(cols.length*rows.length);
		let completenessText = (100*completeness).toFixed(1)+'%';
		let color = completeness2color(completeness);
		
		html.push(`<tr style="color:${color}"><td><a href="${name}">${name}</a></td><td>${cols.length}</td><td>${rows.length}</td><td>${completenessText}</td></tr>`);
	});

	html.push('</tbody></table>');
	html.push('<p><a href="https://github.com/ard-data/2020-rki-impf-archive">GitHub.com/ARD-Data/2020-RKI-Impf-Archive</a></p>')
	html.push('</body></html>');

	fs.writeFileSync(resolve(dirDst, 'index.html'), html.join('\n'));
}


function generateParameterIndex() {
	parameters.sort((a,b) => a.slug < b.slug ? -1 : 1);

	let dimensions = dataDefinition.dimensions;
	dimensions.forEach(d => d.title = d.name[0].toUpperCase()+d.name.slice(1));

	let html = [];
	html.push('<html>')
	html.push(`<head>${htmlStyle}</head>`)
	html.push('<body>')
	html.push('<table>')
	html.push('<thead>')
	html.push('<tr><th></th><th colspan="'+dimensions.length+'">Dimensionen</th><th></th></tr>')
	html.push('<tr><th>Name</th>'+dimensions.map(d => '<th>'+d.title+'</th>').join('')+'<th>Vollständigkeit</th></tr>')
	html.push('</thead>')
	html.push('<tbody>')

	parameters.forEach(p => {
		let completeness = p.definedFor.size/definedFor.size;
		let color = completeness2color(completeness);

		if (completeness === 0) color = '#CCC';
		
		let row = [];
		row.push(p.slug);
		dimensions.forEach(d => row.push(p.cell[d.name]));

		row.push((100*completeness).toFixed(1)+'%');
		html.push(`<tr style="color:${color}"><td>`+row.join('</td><td>')+'</td></tr>');
	});

	html.push('</tbody></table>');
	html.push('<p><a href="https://github.com/ard-data/2020-rki-impf-archive">GitHub.com/ARD-Data/2020-RKI-Impf-Archive</a></p>')
	html.push('</body></html>');

	fs.writeFileSync(resolve(__dirname, '../parameters.html'), html.join('\n'));
}

function completeness2color(v) {
	return 'rgb('+[(256*v-384)*v+128,0,(768*v-640)*v].map(v => Math.max(0,v).toFixed(0)).join(',')+')';
}
