#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const AdmZip = require('adm-zip');
const { DOMParser } = require('xmldom');
const xpath = require('xpath');
const select = xpath.useNamespaces({a:'http://schemas.openxmlformats.org/spreadsheetml/2006/main'});



const dirSrc = resolve(__dirname, '../data/0_original/'); // folder with all XLSX files 
const dirDst = resolve(__dirname, '../data/1_parsed/');  // folder with all resulting JSON files



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
	let data  = extractData(excel);

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

	if (!sheets.front) throw Error('Frontblatt fehlt');
	if (!sheets.indikation) throw Error('Indikationsblatt fehlt');

	let pubDate = extractPubDate(sheets.front);
	let date = extractDate(sheets.front, sheets.indikation.name, pubDate);
	let hourDiff = (Date.parse(pubDate+' 24:00') - Date.parse(date))/(3600000);
	if ((hourDiff <= 0) || (hourDiff > 17)) throw Error(pubDate+', '+date);

	let data = {date, pubDate, states: {
		BW:{code:'BW',title:'Baden-Württemberg'},
		BY:{code:'BY',title:'Bayern'},
		BE:{code:'BE',title:'Berlin'},
		BB:{code:'BB',title:'Brandenburg'},
		HB:{code:'HB',title:'Bremen'},
		HH:{code:'HH',title:'Hamburg'},
		HE:{code:'HE',title:'Hessen'},
		MV:{code:'MV',title:'Mecklenburg-Vorpommern'},
		NI:{code:'NI',title:'Niedersachsen'},
		NW:{code:'NW',title:'Nordrhein-Westfalen'},
		RP:{code:'RP',title:'Rheinland-Pfalz'},
		SL:{code:'SL',title:'Saarland'},
		SN:{code:'SN',title:'Sachsen'},
		ST:{code:'ST',title:'Sachsen-Anhalt'},
		SH:{code:'SH',title:'Schleswig-Holstein'},
		TH:{code:'TH',title:'Thüringen'},
		DE:{code:'DE',title:'Deutschland'},
	}};

	extractIndikation(data.states, sheets.indikation, pubDate);

	if (sheets.hersteller) extractHersteller(data.states, sheets.hersteller, pubDate);

	data.germany = data.states.DE;
	delete data.states.DE;

	return data;

	function extractPubDate(sheet) {
		// figure out, what the publication date is

		let rows = sheet.cells.map(r => r.join('\t'));
		let dateString = [rows[2], rows[5]].join('\t');
		let match;

		if (match = dateString.match(/^\t*Datenstand: (\d\d)\.(\d\d)\.(\d\d\d\d), (\d\d:\d\d) Uhr\t*$/)) {
			return match[3]+'-'+match[2]+'-'+match[1]+' '+match[4];
		}

		if (match = dateString.match(/^\tDatenstand: 28\.12\.2020, 08:00 Uhr\t(44\d\d\d)\t(\d\d:\d\d) Uhr$/)) {
			let d = (parseFloat(match[1])-25568.5)*86400000;
			d = (new Date(d)).toISOString();
			d = d.substr(0,10)+' '+match[2];
			return d;
		}

		if (dateString.startsWith('Datenstand: 28.12.2020, 08:00 Uhr\t44200\t12:00 Uhr')) return '2021-01-04 12:00';

		if (match = dateString.match(/^Datenstand: (\d\d)\.(\d\d)\.(\d\d\d\d), (\d\d:\d\d) Uhr\tNaN\tNaN\tNaN\t/)) {
			return match[3]+'-'+match[2]+'-'+match[1]+' '+match[4];
		}

		console.log(JSON.stringify(dateString));
		throw Error('Can not parse pub date');
	}

	function extractDate(sheet, sheetName, pubDate) {
		// figure out, what the date is

		let rows = sheet.cells.map(r => r.join('\t'));
		let dateString = rows[4];
		let match;

		if (match = sheetName.match(/^(\d\d)\.(\d\d)\.(\d\d)$/)) {
			return '20'+match[3]+'-'+match[2]+'-'+match[1];
		}

		if (match = sheetName.match(/^Impfungen_bis_einschl_(\d\d)\.(\d\d)\.(\d\d)$/)) {
			return '20'+match[3]+'-'+match[2]+'-'+match[1];
		}

		if (match = dateString.match(/^Durchgeführte Impfungen bundesweit und nach Bundesland sowie nach STIKO-Indikation bis einschließlich (\d\d)\.(\d\d)\.(\d\d) \(Impfungen_bis_einschl_/)) {
			return '20'+match[3]+'-'+match[2]+'-'+match[1];
		}

		if (sheetName === 'Presse' && pubDate === '2020-12-29 08:00') return '2020-12-28';

		console.log(JSON.stringify(dateString));
		throw Error('Can not parse date');
	}

	function extractIndikation(data, sheet, pubDate) {
		let range = 'C3:J19';
		if (pubDate < '2021-01-17') range = 'C2:I18';
		if (pubDate < '2021-01-07') range = 'B2:H18';
		if (pubDate < '2021-01-04') range = 'B2:G18';
		range = excel.parseRange(range);
		try {
			checkHeaderLeftAndBottom(sheet.cells, range);
			return extractDataSheet(data, sheet.cells, range);
		} catch (e) {
			console.log('for date "'+pubDate+'":');
			console.log('in sheet "'+sheet.name+'" ('+sheet.type+'):');
			throw e;
		}
	}

	function extractHersteller(data, sheet, pubDate) {
		let range = 'C4:J20';
		if (pubDate < '2021-01-19') range = 'C4:I20';
		range = excel.parseRange(range);
		try {
			checkHeaderLeftAndBottom(sheet.cells, range);
			return extractDataSheet(data, sheet.cells, range);
		} catch (e) {
			console.log('for date "'+pubDate+'":');
			console.log('in sheet "'+sheet.name+'" ('+sheet.type+'):');
			throw e;
		}
	}

	function checkHeaderLeftAndBottom(cells, range) {
		let value;
		if (value = mergeColCells(cells, range.colMax+1, 0, range.rowMin-1).trim()) throw Error(JSON.stringify(value));
		if (value = mergeRowCells(cells, range.rowMax+1, 0, range.colMin-1).trim()) throw Error(JSON.stringify(value));
	}

	function extractDataSheet(data, cells, range) {
		for (let row = range.rowMin; row <= range.rowMax; row++) {
			for (let col = range.colMin; col <= range.colMax; col++) {
				let rowId = parseRowHeader(mergeRowCells(cells, row, 0, range.colMin-1));
				let colId = parseColHeader(mergeColCells(cells, col, 0, range.rowMin-1));

				data[rowId][colId] = cells[row][col];
			}
		}
		return data;
	}

	function mergeRowCells(cells, row, colMin, colMax) {
		return (cells[row] || []).slice(colMin, colMax+1).join('\t');
	}

	function mergeColCells(cells, col, rowMin, rowMax) {
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
	function parseColHeader(text) {
		text = text.replace(/\*/g,'');
		switch (text) {
			case 'Gesamtzahl bisher verabreichter Impfstoffdosen\tGesamtzahl bisher verabreichter Impfstoffdosen\tGesamtzahl bisher verabreichter Impfstoffdosen': return 'impfungen_kumulativ';

			case 'Impfungen kumulativ': return 'impfungen_kumulativ';

			case 'Erstimpfung\tImpfungen kumulativ\tGesamt': return 'impfungen_kumulativ_erstimpfung';
			case 'Zweitimpfung\tImpfungen kumulativ\tImpfungen kumulativ': return 'impfungen_kumulativ_zweitimpfung';

			case 'Erstimpfung\tImpfungen kumulativ\tBioNTech': return 'impfungen_kumulativ_by_biontech_erstimpfung';
			case 'Zweitimpfung\tImpfungen kumulativ\tBioNTech': return 'impfungen_kumulativ_by_biontech_zweitimpfung';

			case 'Erstimpfung\tImpfungen kumulativ\tModerna': return 'impfungen_kumulativ_by_moderna_erstimpfung';
			case 'Zweitimpfung\tImpfungen kumulativ\tModerna': return 'impfungen_kumulativ_by_moderna_zweitimpfung';

			case 'Differenz zum Vortag': return 'differenz_zum_vortag';
			case 'Erstimpfung\tDifferenz zum Vortag\tDifferenz zum Vortag': return 'differenz_zum_vortag_erstimpfung';
			case 'Zweitimpfung\tDifferenz zum Vortag\tDifferenz zum Vortag': return 'differenz_zum_vortag_zweitimpfung';

			case 'Impfungen pro 1.000 Einwohner': return 'impfungen_pro_1000_einwohner';
			case 'Erstimpfung\tImpf-quote, %\tImpf-quote, %': return 'impfungen_prozent_erstimpfung';
			case 'Zweitimpfung\tImpf-quote, %\tImpf-quote, %': return 'impfungen_prozent_zweitimpfung';

			case 'Indikation nach Alter': return 'indikation_nach_alter';
			case 'Erstimpfung\tIndikation nach Alter': return 'indikation_nach_alter_erstimpfung';
			case 'Zweitimpfung\tIndikation nach Alter': return 'indikation_nach_alter_zweitimpfung';
			
			case 'Berufliche Indikation': return 'berufliche_indikation';
			case 'Erstimpfung\tBerufliche Indikation': return 'berufliche_indikation_erstimpfung';
			case 'Zweitimpfung\tBerufliche Indikation': return 'berufliche_indikation_zweitimpfung';
			
			case 'Medizinische Indikation': return 'medizinische_indikation';
			case 'Erstimpfung\tMedizinische Indikation': return 'medizinische_indikation_erstimpfung';
			case 'Zweitimpfung\tMedizinische Indikation': return 'medizinische_indikation_zweitimpfung';
			
			case 'Pflegeheim-bewohnerIn': return 'pflegeheimbewohnerin';
			case 'Erstimpfung\tPflegeheim-bewohnerIn': return 'pflegeheimbewohnerin_erstimpfung';
			case 'Zweitimpfung\tPflegeheim-bewohnerIn': return 'pflegeheimbewohnerin_zweitimpfung';
		}

		throw Error('unknown Col Header '+JSON.stringify(text))
	}
}
