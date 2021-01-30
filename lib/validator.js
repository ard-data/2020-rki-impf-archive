"use strict"


const fs = require('fs');



const dimensions = [
	{name: 'dosis', elements:['dosen','erst','voll']},
	{name: 'hersteller', elements:['alle','biontech','moderna']},
	{name: 'indikation', elements:['alle','alter','beruf','medizinisch','pflegeheim']},
	{name: 'kumulativ', elements:['kumulativ', 'differenz']},
	{name: 'quote', elements:['absolut','impfquote','impfinzidenz']},
]
const cubes = [
	{dimensions:new Set(['dosis','hersteller'])},
	{dimensions:new Set(['dosis','indikation'])},
	{dimensions:new Set(['dosis','kumulativ'])},
	{dimensions:new Set(['dosis','quote'])},
]



module.exports = {
	parameters: getAllParameters(),
	getSlug,
	dimensions,
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
		obj.cubes = cubes.filter(cube => {
			return dimensions.every(dimension => {
				if (cube.dimensions.has(dimension.name)) return true;
				return (obj[dimension.name] === dimension.elements[0]);
			})
		})
		return obj.cubes.length > 0;
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
	if (key === 'erst,alle,alle,differenz,absolut') return 'personen_erst_differenz_zum_vortag';
	if (key === 'voll,alle,alle,differenz,absolut') return 'personen_voll_differenz_zum_vortag';

	if (key === 'dosen,alle,alle,kumulativ,impfquote') return 'impfquote_dosen';
	if (key === 'erst,alle,alle,kumulativ,impfquote') return 'impfquote_erst';
	if (key === 'voll,alle,alle,kumulativ,impfquote') return 'impfquote_voll';

	if (key === 'dosen,alle,alle,kumulativ,impfinzidenz') return 'impfinzidenz_dosen';
	if (key === 'erst,alle,alle,kumulativ,impfinzidenz') return 'impfinzidenz_erst';
	if (key === 'voll,alle,alle,kumulativ,impfinzidenz') return 'impfinzidenz_voll';

	console.log(cell, key);
	throw Error('unknown slug');
}






