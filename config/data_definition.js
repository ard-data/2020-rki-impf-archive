"use strict"


const fs = require('fs');


module.exports = date => {

	const dimensions = [
		{name: 'dosis', elements:['dosen','erst','voll']},
		{name: 'hersteller', elements:['alle','biontech','moderna','astrazeneca']},
		{name: 'indikation', elements:['alle','alter','beruf','medizinisch','pflegeheim'], optional: date >= '2021-04-08'},
		{name: 'kumulativ', elements:['kumulativ', 'differenz'], optional:true},
		{name: 'quote', elements:['absolut','impf_quote','impf_inzidenz']},
		{name: 'impfstelle', elements:['alle','zentral','aerzte'], ignore: date < '2021-04-08'},
		{name: 'alter', elements:['alle','<60','60+'], optional:true, ignore: date < '2021-04-08'},
	].filter(d => !d.ignore);

	const dimensionNames = dimensions.map(d => d.name);
	const dimensionsLookup = new Map(dimensions.map(d => [d.name,d]));

	const slices = [
		{dimensions:new Set(['dosis','hersteller']), ignore: date >= '2021-04-08'},
		{dimensions:new Set(['dosis','hersteller','impfstelle']), ignore: date < '2021-04-08'},
		{dimensions:new Set(['dosis','alter','impfstelle']), ignore: date < '2021-04-08'},
		{dimensions:new Set(['dosis','indikation']), optional: date >= '2021-04-08'},
		{dimensions:new Set(['dosis','quote'])},
		{dimensions:new Set(['dosis','kumulativ'])},
	].filter(d => !d.ignore);

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





	function getAllParameters() {
		// finde alle möglichen kombinationen aus elementen der dimensionen
		let parameters = [{cell:{}}];
		dimensions.forEach(dimension => {
			let result = [];
			dimension.elements.forEach((element, index) => {
				let optional = dimension.optional && (index > 0)
				parameters.forEach(obj => {
					let cell = Object.assign({}, obj.cell);
					cell[dimension.name] = element;
					result.push({
						cell,
						optional: optional || obj.optional || false
					});
				})
			})
			parameters = result;
		})

		parameters = parameters.filter(obj => {
			obj.slices = slices.filter(slice => {
				return dimensions.every(dimension => {
					if (slice.dimensions.has(dimension.name)) return true;
					return (obj.cell[dimension.name] === dimension.elements[0]);
				})
			})
			return obj.slices.length > 0;
		})

		parameters = parameters.map(obj => {
			let slug = getSlug(obj.cell);
			return {
				cell:obj.cell,
				slug,
				optional:obj.optional
			}
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
			let onlyKnownDimensions = Object.keys(query).every(key => dimensionsLookup.has(key));
			if (!onlyKnownDimensions) return false;

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

	return {
		parameters: getAllParameters(),
		getSlug,
		dimensions,
		regions,
	}
}