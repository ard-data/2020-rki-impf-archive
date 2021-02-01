#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const validator = require('../lib/validator.js');



const dirSrc = resolve(__dirname, '../data/2_completed/');

const states = 'BW,BY,BE,BB,HB,HH,HE,MV,NI,NW,RP,SL,SN,ST,SH,TH'.split(',');



const keys = validator.parameters.map(p => p.slug);

let tables = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	states.forEach(state => addObj(data.states[state], state))
	addObj(data.germany, 'DE');

	function addObj(obj, region) {
		let key = [data.date, region].join('_');
		if (!tables.has(key)) tables.set(key, {});
		let table = tables.get(key);

		keys.forEach(key => table[key] = obj[key]);
		table.date = data.date;
		table.pubDate = data.pubDate;
		table.region = region;
	}
})

keys.unshift('region');
keys.unshift('pubDate');
keys.unshift('date');
tables = Array.from(tables.values());
tables.sort((a,b) => {
	if (a.pubDate === b.pubDate) return a.region < b.region ? -1 : 1;
	return a.pubDate < b.pubDate ? -1 : 1
});
tables = tables.map(table => keys.map(key => table[key]));
tables.unshift(keys);
tables = tables.map(table => JSON.stringify(table));
tables = tables.join('\n');

	console.log(tables.length);

