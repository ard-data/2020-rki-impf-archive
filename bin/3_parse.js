#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const select = xpath.useNamespaces({a:'http://schemas.openxmlformats.org/spreadsheetml/2006/main'});



const dirSrc = resolve(__dirname, '../data/0_archived/');
const dirDst = resolve(__dirname, '../data/1_parsed/');
const letters = Object.fromEntries(',A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z'.split(',').map((c,i) => [c,i]));
const excelColHeaders = [
	{index:1, name:'impfungen_kumulativ', text:'Impfungen kumulativ'},
	{index:2, name:'differenz_zum_vortag', text:'Differenz zum Vortag'},
	{index:3, name:'indikation_nach_alter', text:'Indikation nach Alter'},
	{index:4, name:'berufliche_indikation', text:'Berufliche Indikation'},
	{index:5, name:'medizinische_indikation', text:'Medizinische Indikation'},
	{index:6, name:'pflegeheimbewohnerin', text:'Pflegeheim-bewohnerIn'},
];
const excelRowHeaders = [
	{index: 1, name:'BW', text:'Baden-Württemberg'},
	{index: 2, name:'BY', text:'Bayern'},
	{index: 3, name:'BE', text:'Berlin'},
	{index: 4, name:'BB', text:'Brandenburg'},
	{index: 5, name:'HB', text:'Bremen'},
	{index: 6, name:'HH', text:'Hamburg'},
	{index: 7, name:'HE', text:'Hessen'},
	{index: 8, name:'MV', text:'Mecklenburg-Vorpommern'},
	{index: 9, name:'NI', text:'Niedersachsen'},
	{index:10, name:'NW', text:'Nordrhein-Westfalen'},
	{index:11, name:'RP', text:'Rheinland-Pfalz'},
	{index:12, name:'SL', text:'Saarland'},
	{index:13, name:'SN', text:'Sachsen'},
	{index:14, name:'ST', text:'Sachsen-Anhalt'},
	{index:15, name:'SH', text:'Schleswig-Holstein'},
	{index:16, name:'TH', text:'Thüringen'},
	{index:17, name:'DE', text:'Gesamt'},
];


let todos = [];
fs.readdirSync(dirSrc).forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.xlsx/.test(filename)) return;

	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename.replace(/\.xlsx$/i, '.json'));

	if (fs.existsSync(fullnameDst)) return;

	console.log('parse '+filename);

	// unzip excel file
	let zip = new AdmZip(fullnameSrc);

	let workbook, sheet, strings;

	zip.getEntries().forEach(e => {
		if (e.entryName.endsWith('xl/worksheets/sheet2.xml')) return sheet = p(e); // get worksheet
		if (e.entryName.endsWith('xl/sharedStrings.xml')) return strings = p(e); // get shared strings
		if (e.entryName.endsWith('xl/workbook.xml')) return workbook = p(e); // get workbook definition

		function p(e) {
			return new DOMParser().parseFromString(e.getData().toString('utf8'));
		}
	})

	// get workbook name, cause it's the date
	workbook = select('//a:sheet', workbook)[1].getAttribute('name');
	let date = workbook.split('.');
	date = (new Date(2000+parseFloat(date[2]), parseFloat(date[1])-1, parseFloat(date[0]), 12));
	date = date.toISOString().slice(0,10);
	// really strong test for the correct date
	if (date.substr(8,2)+'.'+date.substr(5,2)+'.'+date.substr(2,2) !== workbook) throw Error();
	
	// extract shared strings
	strings = select('//a:si', strings).map(string => select('.//a:t[not(ancestor::a:rPh)]', string).map(t => t.textContent).join(''));

	// extract cell content
	let cells = [];
	select('/a:worksheet/a:sheetData/a:row/a:c', sheet).forEach(node => {
		let range = node.getAttribute('r').split(/([0-9]+)/);
		let col = colToInt(range[0])-1;
		let row = parseInt(range[1])-1;
		let value = (select('a:v', node, 1) || {textContent: ''}).textContent;
		let type = node.getAttribute('t') || '';

		switch (type) {
			case 's': value = strings[parseInt(value, 10)]; break;
			case '': value = parseInt(value, 10); break;
			default: throw Error('unknown cell type '+type);
		}

		if (!cells[row]) cells[row] = [];
		cells[row][col] = value;
		

		function colToInt(col) {
			return col.trim().split('').reduce((n, c) => n*26 +letters[c], 0);
		}
	});
	
	excelColHeaders.forEach(h => { if (cells[0][h.index].replace(/\*+$/,'') !== h.text) throw Error(JSON.stringify(h)) })
	excelRowHeaders.forEach(h => { if (cells[h.index][0].replace(/\*+$/,'') !== h.text) throw Error(JSON.stringify(h)) })

	let data = {date, states:{}};
	excelRowHeaders.forEach(r => {
		let obj = {
			code:r.name,
			title:r.text,
		};
		excelColHeaders.forEach(c => {
			obj[c.name] = cells[r.index][c.index];
		})
		if (r.name === 'DE') return data.germany = obj;
		data.states[r.name] = obj;
	})

	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));
})


