#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const dataDefinition = require('../config/data_definition.js');



const dirSrc = resolve(__dirname, '../data/2_completed/');
const dirDst = resolve(__dirname, '../web/');

const states = 'BW,BY,BE,BB,HB,HH,HE,MV,NI,NW,RP,SL,SN,ST,SH,TH'.split(',');



const keys = dataDefinition.parameters.map(p => p.slug);

let result = new Map();
fs.readdirSync(dirSrc).sort().forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.json/.test(filename)) return;

	let data = JSON.parse(fs.readFileSync(resolve(dirSrc, filename)));

	states.forEach(state => addObj(data.states[state], state))
	addObj(data.germany, 'DE');

	function addObj(obj, region) {
		let key = [data.date, region].join('_');
		if (!result.has(key)) result.set(key, {});
		let table = result.get(key);

		keys.forEach(key => table[key] = obj[key]);
		table.date = data.date;
		table.pubDate = data.pubDate;
		table.region = region;
	}
})

keys.unshift('region');
keys.unshift('pubDate');
keys.unshift('date');
result = Array.from(result.values());
result.sort((a,b) => {
	if (a.pubDate === b.pubDate) return a.region < b.region ? -1 : 1;
	return a.pubDate < b.pubDate ? -1 : 1
});
result = result.map(table => keys.map(key => table[key]));
result.unshift(keys);
result = result.map(table => JSON.stringify(table));
result = '[\n'+result.join(',\n')+'\n]\n';

fs.writeFileSync(resolve(dirDst, 'table.json'), result, 'utf8');
