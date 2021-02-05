"use strict"


const fs = require('fs');



const dimensions = [
	{name: 'dosis', elements:['dosen','erst','voll']},
	{name: 'hersteller', elements:['alle','biontech','moderna']},
	{name: 'indikation', elements:['alle','alter','beruf','medizinisch','pflegeheim']},
	{name: 'kumulativ', elements:['kumulativ', 'differenz']},
	{name: 'quote', elements:['absolut','impf_quote','impf_inzidenz']},
]

const slices = [
	{dimensions:new Set(['dosis','hersteller'])},
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
	if (cell.hersteller !== 'alle') return [cell.dosis === 'dosen' ? 'dosen' : 'dosen_'+cell.dosis, cell.hersteller, 'kumulativ'].join('_');
	if (cell.indikation !== 'alle') return ['indikation', cell.indikation, cell.dosis].join('_');
	
	let key = dimensions.map(d => cell[d.name]).join(',');

	if (key === 'dosen,alle,alle,kumulativ,absolut') return 'dosen_kumulativ';
	if (key === 'erst,alle,alle,kumulativ,absolut') return 'personen_erst_kumulativ';
	if (key === 'voll,alle,alle,kumulativ,absolut') return 'personen_voll_kumulativ';

	if (key === 'dosen,alle,alle,differenz,absolut') return 'dosen_differenz_zum_vortag';
	if (key === 'erst,alle,alle,differenz,absolut') return 'dosen_erst_differenz_zum_vortag';
	if (key === 'voll,alle,alle,differenz,absolut') return 'dosen_voll_differenz_zum_vortag';

	if (key === 'dosen,alle,alle,kumulativ,impf_quote') return 'impf_quote_dosen';
	if (key === 'erst,alle,alle,kumulativ,impf_quote') return 'impf_quote_erst';
	if (key === 'voll,alle,alle,kumulativ,impf_quote') return 'impf_quote_voll';

	if (key === 'dosen,alle,alle,kumulativ,impf_inzidenz') return 'impf_inzidenz_dosen';
	if (key === 'erst,alle,alle,kumulativ,impf_inzidenz') return 'impf_inzidenz_erst';
	if (key === 'voll,alle,alle,kumulativ,impf_inzidenz') return 'impf_inzidenz_voll';

	console.log(cell, key);
	throw Error('unknown slug');
}






