"use strict"

const regions = 'BW,BY,BE,BB,HB,HH,HE,MV,NI,NW,RP,SL,SN,ST,SH,TH'.split(',');

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

const dimLookup = Object.fromEntries(dimensions.map(d => [d.name, d.elements   ])); Object.freeze(dimLookup);
const cell0Def = dimensions.map(d => ({key:d.name, value:d.elements[0]}));
const parameters = getAllParameters();
const checks = getAllChecks();



module.exports = {
	complete: completeAllRegions,
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

function completeAllRegions(data) {
	let date = data.date;

	completeRegion(data.germany);
	regions.forEach(r => completeRegion.data.states(r));

	function completeRegion(entry) {

		// fix null values
		//if (date <= '2020-12-30')
		entry.dosen_voll_biontech_kumulativ = entry.personen_voll_kumulativ;

		// calc missing values
		checks.forEach(check => {
			let value = check.calc(entry);
			if (!Number.isFinite(value)) {
				console.log(entry);
				console.log('Can not calc: '+check.debug);
				throw Error();
			}
			if (value !== entry[check.key]) {
				console.log(check);
				console.log(value);
				console.log(entry);
				throw Error('value !== entry[check.key]');
			}
		})

		// check values
		parameters.forEach(parameter => {
			let slug = parameter.slug;
			let value = entry[slug];
			if (!Number.isFinite(value)) {
				console.log(entry);
				console.log(slug);
				throw Error();
			}
		})

		//function checkSum(key )
	}
}

function getAllChecks() {
	let checks = [];

	generateSum('dosis','hersteller');
	generateSum('hersteller','dosis');

	function generateSum(sumKey, forKey) {
		dimLookup[forKey].forEach(forValue => {
			let cell = {};
			cell0Def.forEach(e => cell[e.key] = e.value);
			cell[forKey] = forValue;
			let slug0 = getCellSlug(cell);
			let slugs = dimLookup[sumKey].slice(1).map(sumValue => {
				cell[sumKey] = sumValue;
				return getSlug(cell);
			})
			checks.push({key:slug0, calc:obj => slugs.reduce((sum, slug) => sum + obj[slug], 0), debug:slug0+' = '+slugs.join(' + ')});
		})
	}

	dimLookup.hersteller.forEach(hersteller => {
		let slug1 = getCellSlug({dosis:'dosen', hersteller});
		let slug2 = getCellSlug({dosis:'erst',  hersteller});
		let slug3 = getCellSlug({dosis:'voll',  hersteller});
		checks.push({key:slug1, calc:obj => obj[slug2] + obj[slug3], debug:slug1+' = '+slug2+' + '+slug3});
	})

	dimLookup.hersteller.forEach(hersteller => {
		let slug1 = getCellSlug({dosis:'dosen', hersteller});
		let slug2 = getCellSlug({dosis:'erst',  hersteller});
		let slug3 = getCellSlug({dosis:'voll',  hersteller});
		checks.push({key:slug1, calc:obj => obj[slug2] + obj[slug3], debug:slug1+' = '+slug2+' + '+slug3});
	})

	return checks;

	function getCellSlug(obj) {
		cell0Def.forEach(e => {
			if (!obj[e.key]) obj[e.key] = e.value;
		})
		return getSlug(obj);
	}
}

