"use strict"


const fs = require('fs');



const dimensions = [
	{name: 'dosis', elements:['dosen','erst','voll']},
	{name: 'hersteller', elements:['alle','biontech','moderna','astrazeneca']},
	{name: 'indikation', elements:['alle','alter','beruf','medizinisch','pflegeheim']},
	{name: 'kumulativ', elements:['kumulativ', 'differenz']},
	{name: 'quote', elements:['absolut','impf_quote','impf_inzidenz']},
	{name: 'impfstelle', elements:['alle','zentral','aerzte']},
	{name: 'alter', elements:['alle','<60','60+']},
]

const dimensionNames = dimensions.map(d => d.name);

const slices = [
	{dimensions:new Set(['dosis','hersteller','impfstelle'])},
	{dimensions:new Set(['dosis','alter','impfstelle'])},
	{dimensions:new Set(['dosis','indikation'])},
	{dimensions:new Set(['dosis','quote'])},
	{dimensions:new Set(['dosis','kumulativ'])},
]

const regions = [
	{code:'BW', pop:11100394, title:'Baden-Württemberg'},
	{code:'BY', pop:13124737, title:'Bayern'},
	{code:'BE', pop: 3669491, title:'Berlin'},
	{code:'BB', pop: 2521893, title:'Brandenburg'},
	{code:'HB', pop:  681202, title:'Bremen'},
	{code:'HH', pop: 1847253, title:'Hamburg'},
	{code:'HE', pop: 6288080, title:'Hessen'},
	{code:'MV', pop: 1608138, title:'Mecklenburg-Vorpommern'},
	{code:'NI', pop: 7993608, title:'Niedersachsen'},
	{code:'NW', pop:17947221, title:'Nordrhein-Westfalen'},
	{code:'RP', pop: 4093903, title:'Rheinland-Pfalz'},
	{code:'SL', pop:  986887, title:'Saarland'},
	{code:'SN', pop: 4071971, title:'Sachsen'},
	{code:'ST', pop: 2194782, title:'Sachsen-Anhalt'},
	{code:'SH', pop: 2903773, title:'Schleswig-Holstein'},
	{code:'TH', pop: 2133378, title:'Thüringen'},
	{code:'DE', pop:83166711, title:'Deutschland'},
]

const cellQueryCache = new Map();


module.exports = {
	parameters: getAllParameters(),
	getSlug,
	dimensions,
	regions,
}



function getAllParameters() {
	// finde alle möglichen kombinationen aus elementen der dimensionen
	let parameters = [{}];
	dimensions.forEach(dimension => {
		let result = [];
		dimension.elements.forEach(element => {
			parameters.forEach(obj => {
				obj = Object.assign({}, obj);
				obj[dimension.name] = element;
				result.push(obj);
			})
		})
		parameters = result;
	})

	parameters = parameters.filter(obj => {
		obj.slices = slices.filter(slice => {
			return dimensions.every(dimension => {
				if (slice.dimensions.has(dimension.name)) return true;
				return (obj[dimension.name] === dimension.elements[0]);
			})
		})
		return obj.slices.length > 0;
	})

	parameters = parameters.map(cell => {
		let slug = getSlug(cell);
		return { cell, slug };
	})

	return parameters;
}


function getSlug(cell) {
	let suffix = '';

	switch (cell.impfstelle) {
		case 'alle':break;
		case 'zentral': suffix += '_impfstelle_zentral'; break;
		case 'aerzte': suffix += '_impfstelle_aerzte'; break;
		default: throw Error();
	}

	switch (cell.alter) {
		case 'alle':break;
		case '<60': suffix += '_alter_unter60'; break;
		case '60+': suffix += '_alter_60plus'; break;
		default: throw Error();
	}

	if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',hersteller:'!0'})) return [cell.dosis === 'dosen' ? 'dosen' : 'dosen_'+cell.dosis, cell.hersteller, 'kumulativ'].join('_')+suffix;
	
	if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',indikation:'!0'})) return ['indikation', cell.indikation, cell.dosis].join('_')+suffix;
	
	if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*'})) {
		if (cell.dosis === 'dosen') return 'dosen_kumulativ'+suffix;
		if (cell.dosis === 'erst' ) return 'personen_erst_kumulativ'+suffix;
		if (cell.dosis === 'voll' ) return 'personen_voll_kumulativ'+suffix;
	}

	if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',kumulativ:'differenz'})) {
		if (cell.dosis === 'dosen') return 'dosen_differenz_zum_vortag'+suffix;
		if (cell.dosis === 'erst' ) return 'dosen_erst_differenz_zum_vortag'+suffix;
		if (cell.dosis === 'voll' ) return 'dosen_voll_differenz_zum_vortag'+suffix;
	}

	if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',quote:'impf_quote'   })) return 'impf_quote_'+cell.dosis+suffix;
	if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',quote:'impf_inzidenz'})) return 'impf_inzidenz_'+cell.dosis+suffix;

	console.log(cell);
	console.log(dimensionNames.map(d => cell[d]).join(','));
	throw Error('unknown slug');

	function cellIsIn(query) {
		query = fixQuery(query);
		return dimensionNames.every(d => query[d].has(cell[d]));

		function fixQuery(query) {
			let key = JSON.stringify(query);
			if (cellQueryCache.has(key)) return cellQueryCache.get(key);

			let obj = {};
			dimensions.forEach(d => {
				if (query[d.name] === undefined) return obj[d.name] = new Set(d.elements.slice(0,1));
				if (query[d.name] === '*'      ) return obj[d.name] = new Set(d.elements);
				if (query[d.name] === '!0'     ) return obj[d.name] = new Set(d.elements.slice(1));
				return obj[d.name] = new Set(query[d.name].split(','));
			});
			cellQueryCache.set(key,obj);
			return obj;
		}
	}
}




