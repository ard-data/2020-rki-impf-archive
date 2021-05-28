#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const dataDefinition = require('../config/data_definition.js')('2021-04-08');



const dirSrc = resolve(__dirname, '../data/2_completed/');
const dirDst = resolve(__dirname, '../data/9_csv_v2/');
fs.mkdirSync(dirDst, {recursive:true});

const metrics = dataDefinition.parameters.map(p => p.slug);
const states = dataDefinition.regions.map(r => r.code).filter(r => r !== 'DE');


// Alle JSON-Dateien durchgehen und die Werte hinzufügen.
const tables = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	states.forEach(state => addObj(data, data.states[state]))
	addObj(data, data.germany);
})

// Alle Tabellen speichern
Array.from(tables.values()).forEach(table => {
	let fullname = resolve(dirDst, table.filename);

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

// Ein Tabellen-Index als HTML erzeugen und speichern.
let html = [];
html.push('<html>');
html.push('<head><style>')
html.push('body { font-family:sans-serif; }')
html.push('a { color:#000 !important; }')
html.push('table { margin:50px auto; border-spacing:0; }')
html.push('th, td { padding: 1px 5px; }')
html.push('td { text-align: right }')
html.push('td:first-child { text-align: left }')
html.push('tr:hover td { background: #eee }')
html.push('</style></head>')
html.push('<body>')
html.push('<table>')
html.push('<thead><tr><th>Dateiname</th><th>Spalten</th><th>Zeilen</th><th>Vollständigkeit</th></tr></thead>')
html.push('<tbody>')

Array.from(tables.values()).sort((a,b) => a.filename < b.filename ? -1 : 1).forEach(f => {
	let name = f.filename;
	let cols = f.cols.filter(c => c.isNumber);
	let rows = f.entries;
	
	let completeness = 0;
	f.entries.forEach(e => {
		cols.forEach(c => {
			if (Number.isFinite(e.row[c.index])) completeness++;
		})
	});
	completeness = (100*(completeness/(cols.length*rows.length))).toFixed(1)+'%';
	
	html.push(`<tr><td><a href="${name}">${name}</a></td><td>${cols.length}</td><td>${rows.length}</td><td>${completeness}</td></tr>`);
});

html.push('</tbody></table>');
html.push('</body></html>');

fs.writeFileSync(resolve(dirDst, 'index.html'), html.join('\n'));



function addObj(data, obj) {
	let date = data.date;
	let pubDate = data.pubDate;
	let region = obj.code;
	addCell('region_'+region, date, 'date', date);
	addCell('region_'+region, date, 'publication_date', pubDate);

	metrics.forEach(metric => {

		addCell('metric_'+metric, date, 'date', date);
		addCell('metric_'+metric, date, 'publication_date', pubDate);

		let value = obj[metric];

		addCell('region_'+region, date, metric, value, true);

		addCell('metric_'+metric, date, region, value, true);

		addCell('all', date+'_'+region+'_'+metric, 'date', date);
		addCell('all', date+'_'+region+'_'+metric, 'publication_date', pubDate);
		addCell('all', date+'_'+region+'_'+metric, 'region', region);
		addCell('all', date+'_'+region+'_'+metric, 'metric', metric);
		addCell('all', date+'_'+region+'_'+metric, 'value', value, true);
	})
}

function addCell(table, key, col, value, isNumber) {

	if (!tables.has(table)) tables.set(table, {filename:table+'.csv', entries:new Map(), cols:new Map()});
	table = tables.get(table);

	if (!table.cols.has(col)) table.cols.set(col, {text:col, index:table.cols.size, isNumber});
	col = table.cols.get(col);

	if (!table.entries.has(key)) table.entries.set(key, {index:table.entries.size, row:[]});

	if ((value === undefined) || (value === null)) return;

	let entry = table.entries.get(key);
	entry.row[col.index] = value;
}
