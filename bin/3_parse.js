#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const select = xpath.useNamespaces({a:'http://schemas.openxmlformats.org/spreadsheetml/2006/main'});
const dataDefinition = require('../config/data_definition.js');



const dirSrc = resolve(__dirname, '../data/0_original/'); // folder with all XLSX files 
const dirDst = resolve(__dirname, '../data/1_parsed/');  // folder with all resulting JSON files
fs.mkdirSync(dirDst, {recursive:true});



// scan for files
let files = fs.readdirSync(dirSrc);
files.forEach(filename => {
	if (!/^impfquotenmonitoring-202.*\.xlsx$/.test(filename)) return;

	// full name of source XLSX file and resulting JSON file
	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename.replace(/\.xlsx$/i, '.json'));

	// ignore, when JSON file already exists
	if (fs.existsSync(fullnameDst)) return;

	console.log('parse '+filename);

	// parse excel file
	let excel = parseExcel(fullnameSrc);

	// extract data
	let data = extractData(excel);

	// add filename
	data.filename = filename;

	// save data structure as JSON
	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));
})



function parseExcel(filename) {
	// extract sheets with names and cells, take care of merged cells

	const letters = Object.fromEntries(',A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z'.split(',').map((c,i) => [c,i]));

	// unzip excel file
	let zip = new AdmZip(filename);

	// find the XML files we need
	let workbook, sheets = new Map(), strings, match;
	zip.getEntries().forEach(e => {
		// get workbook for the sheet names;
		if (e.entryName.endsWith('xl/workbook.xml')) return workbook = p(e);

		// get sheets
		if (match = e.entryName.match(/xl\/worksheets\/sheet(\d+)\.xml$/)) {
			sheets.set(match[1], {node:p(e)});
			return
		}

		// get shared strings
		if (e.entryName.endsWith('xl/sharedStrings.xml')) {
			strings = p(e);
			strings = select('//a:si', strings).map(string => 
				select('.//a:t[not(ancestor::a:rPh)]', string).map(node => node.textContent).join('')
			)
			return
		}

		function p(e) {
			return new DOMParser().parseFromString(e.getData().toString('utf8'));
		}
	})

	// add names from workbook to sheets
	select('/a:workbook/a:sheets/a:sheet', workbook).forEach(node => {
		let id = node.getAttribute('r:id').match(/^rId(\d+)$/)[1];
		let name = node.getAttribute('name');
		sheets.get(id).name = name;
	})

	// parse sheets
	sheets = Array.from(sheets.values());
	sheets.forEach(sheet => {
		sheet.cells = extractCells(sheet.node);
		delete sheet.node;
	})

	return {
		sheets,
		parseAddress,
		parseRange,
	}

	function extractCells(sheet) {
		let cells = [];
		// get content of all cells
		select('/a:worksheet/a:sheetData/a:row/a:c', sheet).forEach(node => {
			let {col, row, value} = parseCell(node);

			if (!cells[row]) cells[row] = [];
			cells[row][col] = value;
		});

		// fix merged cells, by duplicating the content
		select('/a:worksheet/a:mergeCells/a:mergeCell', sheet).forEach(node => {
			let range = parseRange(node.getAttribute('ref'));

			let v = cells[range.rowMin][range.colMin];
			for (let row = range.rowMin; row <= range.rowMax; row++) {
				for (let col = range.colMin; col <= range.colMax; col++) {
					cells[row][col] = v;
				}
			}
		});
		return cells;

		function parseCell(node) {
			// get content of a cell

			let {col, row} = parseAddress(node.getAttribute('r'));
			let value = (select('a:v', node, 1) || {textContent: ''}).textContent;
			let type = node.getAttribute('t') || '';

			switch (type) {
				case 's': value = strings[parseInt(value, 10)]; break;
				case '': value = (value === '') ? null : parseFloat(value); break;
				default: throw Error('unknown cell type '+type);
			}

			return {col, row, value};
		}
	}

	function parseAddress(range) {
		// parse a cell address, e.g. 'C5' => {col:2, row:4};

		range = range.split(/([0-9]+)/);
		return {
			col: colToInt(range[0])-1,
			row: parseInt(range[1], 10)-1,
		}

		function colToInt(col) {
			return col.trim().split('').reduce((n, c) => n*26 +letters[c], 0);
		}
	}

	function parseRange(range) {
		// parse a range address, e.g. 'C5:D7' => {colMin:2, colMax:3, rowMin:4, rowMax:6};

		range = range.split(':').map(parseAddress);
		return {
			colMin: Math.min(range[0].col, range[1].col),
			colMax: Math.max(range[0].col, range[1].col),
			rowMin: Math.min(range[0].row, range[1].row),
			rowMax: Math.max(range[0].row, range[1].row),
		}
	}
}

function extractData(excel) {
	// extract the needed numbers from the sheets

	// scan sheets and figure out, what kind of sheets we have
	let sheets = {};
	excel.sheets.forEach(sheet => {
		sheet.type = new Set();

		// front sheet
		if (sheet.name === 'Erläuterung') sheet.type.add('front');
		if (sheet.name === 'Erläuterungen') sheet.type.add('front');

		// sheet "nach Indikationen"
		if (sheet.name.startsWith('Indik_bis_einschl_')) sheet.type.add('indikation');
		if (sheet.name.match(/^\d\d\.\d\d\.2\d$/)) sheet.type.add('indikation');
		if (sheet.name.match(/^Impfungen_bis_einschl_\d\d\.01\.21$/)) sheet.type.add('indikation');
		if (sheet.name === 'Presse') sheet.type.add('indikation');

		// sheet "nach Hersteller"
		if (sheet.name.startsWith('Gesamt_bis_einschl_')) sheet.type.add('hersteller');
		
		// sheet "Impfungen pro Tag"
		if (sheet.name === 'Impfungen_proTag') sheet.type.add('timeline');

		// checks
		if (sheet.type.size === 0) throw Error('Unbekanntes Tabellenblatt: "'+sheet.name+'"');
		if (sheet.type.size > 1) throw Error('Tabellenblatt nicht eindeutig: "'+sheet.name+'"');
		sheet.type = Array.from(sheet.type.values()).pop();
		if (sheets[sheet.type]) throw Error('Tabellenblatt-Typ gibt es doppelt? "'+sheets[sheet.type].name+'" und "'+sheet.name+'"');
		sheets[sheet.type] = sheet;
	})

	// check required sheets
	if (!sheets.front) throw Error('Frontblatt fehlt');
	if (!sheets.indikation) throw Error('Indikationsblatt fehlt');

	// extract publication date
	let pubDate = extractPubDate(sheets.front);

	// extract date up to which the vaccinations are counted
	let date = extractDate(sheets.front, sheets.indikation.name, pubDate);

	// plausibility check: pubdate shouldn't be more than 17 hours after date
	let hourDiff = (Date.parse(pubDate+' 24:00') - Date.parse(date))/(3600000);
	if ((hourDiff <= 0) || (hourDiff > 17)) throw Error(pubDate+', '+date);

	// prepare data object
	let data = {
		date, pubDate, history:[],
		states: Object.fromEntries(dataDefinition.regions.map(r => [r.code, {code:r.code,title:r.title}])),
	}

	// extract indication data
	extractIndikation(data.states, sheets.indikation, pubDate);

	// If available extract data broken down by manufacturer
	if (sheets.hersteller) extractHersteller(data.states, sheets.hersteller, pubDate);
	else if (date > '2021-01-16') throw Error();

	// If available extract data from the vaccination development table
	if (sheets.timeline) extractVerlauf(data.history, sheets.timeline, date);
	else if (date > '2021-01-03') throw Error();

	// remove germany as a state
	data.germany = data.states.DE;
	delete data.states.DE;

	return data;

	function extractPubDate(sheet) {
		// figure out, what the publication date is
		// enter the realm where we try to guesstimate with regular expressions where the author has hidden the publication date

		let rows = sheet.cells.map(r => r.join('\t'));
		let dateString = [rows[2], rows[5]].join('\t');
		let match;

		if (match = dateString.match(/^\tDatenstand: 28\.12\.2020, 08:00 Uhr\t(44\d\d\d)\t(\d\d:\d\d) Uhr$/)) {
			let d = (parseFloat(match[1])-25568.5)*86400000;
			d = (new Date(d)).toISOString();
			d = d.substr(0,10)+' '+match[2];
			return d;
		}

		if (dateString.startsWith('Datenstand: 28.12.2020, 08:00 Uhr\t44200\t12:00 Uhr')) return '2021-01-04 12:00';

		if (match = dateString.match(/^\t*Datenstand: (\d\d)\.(\d\d)\.(\d\d\d\d), (\d\d:\d\d) Uhr/)) {
			return match[3]+'-'+match[2]+'-'+match[1]+' '+match[4];
		}

		console.log(JSON.stringify(dateString));
		throw Error('Can not parse pub date');
	}

	function extractDate(sheet, sheetName, pubDate) {
		// figure out, what the date is up to which the vaccinations are counted
		// enter the realm where we try to guesstimate with regular expressions where the author has hidden the date

		let rows = sheet.cells.map(r => r.join('\t'));
		let dateString = rows[4];
		let match;

		if (match = sheetName.match(/^(\d\d)\.(\d\d)\.(\d\d)$/)) {
			return '20'+match[3]+'-'+match[2]+'-'+match[1];
		}

		if (match = sheetName.match(/^Impfungen_bis_einschl_(\d\d)\.(\d\d)\.(\d\d)$/)) {
			return '20'+match[3]+'-'+match[2]+'-'+match[1];
		}

		if (match = dateString.match(/^Durchgeführte Impfungen bundesweit und nach Bundesland (sowie nach STIKO-Indikation )?bis einschließlich ?(\d\d)\.(\d\d)\.(\d\d) \(/)) {
			return '20'+match[4]+'-'+match[3]+'-'+match[2];
		}

		if (sheetName === 'Presse' && pubDate === '2020-12-29 08:00') return '2020-12-28';

		console.log('dateString', JSON.stringify(dateString));
		console.log('sheetName', JSON.stringify(sheetName));
		throw Error('Can not parse date');
	}

	function extractIndikation(data, sheet, pubDate) {
		// extract data from sheet "indikation"
		let range = 'B2:G18';
		if (pubDate >= '2021-01-04') range = 'B2:H18';
		if (pubDate >= '2021-01-07') range = 'C2:I18';
		if (pubDate >= '2021-01-17') range = 'C3:J19';
		extractDataSheet(data, sheet, range, pubDate);
	}

	function extractHersteller(data, sheet, pubDate) {
		// extract data from sheet "hersteller"
		let range = 'C4:I20';
		if (pubDate >= '2021-01-19') range = 'C4:J20';
		if (pubDate >= '2021-02-04') range = 'C4:M20';
		extractDataSheet(data, sheet, range, pubDate);
	}

	function extractDataSheet(data, sheet, range) {
		try {
			range = excel.parseRange(range);

			// make sure if we guessed the size of the data range correctly
			// we can do that by checking, if the area at the top right/bottom left next to the header area is empty or not
			let nextColHeader = mergeColCells(sheet.cells, range.colMax+1, 0, range.rowMin-1).trim();
			let nextRowHeader = mergeRowCells(sheet.cells, range.rowMax+1, 0, range.colMin-1).trim();
			if (nextColHeader) throw Error(JSON.stringify(nextColHeader));
			if (nextRowHeader) throw Error(JSON.stringify(nextRowHeader));

			// scan data area
			for (let row = range.rowMin; row <= range.rowMax; row++) {
				for (let col = range.colMin; col <= range.colMax; col++) {
					// find state
					let rowId = parseRowHeader(mergeRowCells(sheet.cells, row, 0, range.colMin-1));
					// find metric
					let colId = parseColHeader(mergeColCells(sheet.cells, col, 0, range.rowMin-1), sheet.type, date);
					if (!colId) throw Error();

					// save value
					if (data[rowId][colId]) throw Error();
					data[rowId][colId] = sheet.cells[row][col];
				}
			}

		} catch (e) {
			console.log('for date "'+date+'":');
			console.log('for pubDate "'+pubDate+'":');
			console.log('in sheet "'+sheet.name+'" ('+sheet.type+'):');
			throw e;
		}
	}

	function extractVerlauf(data, sheet, date) {
		let fields = [];
		sheet.cells[0].forEach((v,col) => {
			switch (v.trim()) {
				case '': return;
				case 'Datum':
				case 'Datum der Impfung':
					fields.push({col, key:'date', val:v => (new Date((v-25568.5)*86400000)).toISOString().slice(0,10) });
				return;
				case 'Gesamtzahl Impfungen':
					if (date > '2021-01-16') throw Error();
					fields.push({col, key:'dosen_kumulativ', val:v => v});
				return;
				case 'Gesamtzahl verabreichter Impfstoffdosen':
					fields.push({col, key:'dosen_kumulativ', val:v => v});
				return;
				case 'Erstimpfung':
					fields.push({col, key:'personen_erst_kumulativ', val:v => v});
				return;
				case 'Zweitimpfung':
					fields.push({col, key:'personen_voll_kumulativ', val:v => v || 0});
				return;
				default: throw Error(JSON.stringify(v));
			}
		})
		sheet.cells.slice(1).forEach(row => {
			switch (row[0]) {
				case undefined:
				case null:
				case 'Impfungen gesamt':
				case 'Gesamt':
				return;
			}
			if (Number.isFinite(row[0])) {
				let obj = {};
				fields.forEach(field => obj[field.key] = field.val(row[field.col]));
				data.push(obj);
				return;
			}
			console.log(row);
			throw Error();
		})
	}

	function mergeRowCells(cells, row, colMin, colMax) {
		// join the values of multiple cells in a row
		return (cells[row] || []).slice(colMin, colMax+1).join('\t');
	}

	function mergeColCells(cells, col, rowMin, rowMax) {
		// join the values of multiple cells in a col
		return (cells || []).slice(rowMin, rowMax+1).map(r => r[col]).join('\t');
	}

	function parseRowHeader(text) {
		text = text.split('\t').pop().replace(/\*/g,'');
		switch (text) {
			case 'Baden-Württemberg':      return 'BW';
			case 'Bayern':                 return 'BY';
			case 'Berlin':                 return 'BE';
			case 'Brandenburg':            return 'BB';
			case 'Bremen':                 return 'HB';
			case 'Hamburg':                return 'HH';
			case 'Hessen':                 return 'HE';
			case 'Mecklenburg-Vorpommern': return 'MV';
			case 'Niedersachsen':          return 'NI';
			case 'Nordrhein-Westfalen':    return 'NW';
			case 'Rheinland-Pfalz':        return 'RP';
			case 'Saarland':               return 'SL';
			case 'Sachsen':                return 'SN';
			case 'Sachsen-Anhalt':         return 'ST';
			case 'Schleswig-Holstein':     return 'SH';
			case 'Thüringen':              return 'TH';
			case 'Gesamt':                 return 'DE';
		}

		throw Error('unknown Row Header '+JSON.stringify(text))
	}
	function parseColHeader(text, sheetType, date) {
		let key = (sheetType+'_'+text).toLowerCase().replace(/\*/g,'').replace(/\s+/g,'_');
		if (date <= '2021-01-16') {
			switch (key) {
				case 'indikation_impfungen_kumulativ': return 'dosen_kumulativ';
				case 'indikation_differenz_zum_vortag': return 'dosen_differenz_zum_vortag';
				case 'indikation_indikation_nach_alter': return 'indikation_alter_dosen';
				case 'indikation_berufliche_indikation': return 'indikation_beruf_dosen';
				case 'indikation_medizinische_indikation': return 'indikation_medizinisch_dosen';
				case 'indikation_pflegeheim-bewohnerin': return 'indikation_pflegeheim_dosen';
				case 'indikation_impfungen_pro_1.000_einwohner': return 'impf_inzidenz_erst';
			}
		}
		if (date > '2021-01-16') {
			switch (key) {
				case 'indikation_erstimpfung_indikation_nach_alter': return 'indikation_alter_erst';
				case 'indikation_erstimpfung_berufliche_indikation': return 'indikation_beruf_erst';
				case 'indikation_erstimpfung_medizinische_indikation': return 'indikation_medizinisch_erst';
				case 'indikation_erstimpfung_pflegeheim-bewohnerin': return 'indikation_pflegeheim_erst';
			
				case 'indikation_zweitimpfung_indikation_nach_alter': return 'indikation_alter_voll';
				case 'indikation_zweitimpfung_berufliche_indikation': return 'indikation_beruf_voll';
				case 'indikation_zweitimpfung_medizinische_indikation': return 'indikation_medizinisch_voll';
				case 'indikation_zweitimpfung_pflegeheim-bewohnerin': return 'indikation_pflegeheim_voll';

				case 'hersteller_erstimpfung_impfungen_kumulativ_gesamt': return 'personen_erst_kumulativ';
				case 'hersteller_erstimpfung_impfungen_kumulativ_biontech': return 'dosen_erst_biontech_kumulativ';
				case 'hersteller_erstimpfung_impfungen_kumulativ_moderna': return 'dosen_erst_moderna_kumulativ';
				case 'hersteller_erstimpfung_differenz_zum_vortag_differenz_zum_vortag': return 'dosen_erst_differenz_zum_vortag';
				case 'hersteller_erstimpfung_impf-quote,_%_impf-quote,_%': return 'impf_quote_erst';

				case 'hersteller_zweitimpfung_impfungen_kumulativ_impfungen_kumulativ': return 'personen_voll_kumulativ';
				case 'hersteller_zweitimpfung_impfungen_kumulativ_gesamt': return 'personen_voll_kumulativ';
				case 'hersteller_zweitimpfung_impfungen_kumulativ_biontech': return 'dosen_voll_biontech_kumulativ';
				case 'hersteller_zweitimpfung_impfungen_kumulativ_moderna': return 'dosen_voll_moderna_kumulativ';
				case 'hersteller_zweitimpfung_differenz_zum_vortag_differenz_zum_vortag': return 'dosen_voll_differenz_zum_vortag';
				case 'hersteller_zweitimpfung_impf-quote,_%_impf-quote,_%': return 'impf_quote_voll';

				case 'hersteller_gesamtzahl_bisher_verabreichter_impfstoffdosen_gesamtzahl_bisher_verabreichter_impfstoffdosen_gesamtzahl_bisher_verabreichter_impfstoffdosen': return 'dosen_kumulativ';
			}
		}

		throw Error('unknown Col Header '+JSON.stringify(key))
	}
}
