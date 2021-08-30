"use strict"


const fs = require('fs');


module.exports = date => {

	const dimensions = [
		{name: 'dosis', elements:['dosen','erst','voll','min1','zweit'], sums:[['dosen','erst','voll'],['dosen','min1','zweit']]},
		{name: 'hersteller', elements:['alle','biontech','moderna','astrazeneca','janssen']},
		{name: 'indikation', elements:['alle','alter','beruf','medizinisch','pflegeheim'], optional: date >= '2021-04-08'},
		{name: 'kumulativ', elements:['kumulativ', 'differenz'], optional:true},
		{name: 'quote', elements:['absolut','impf_quote','impf_inzidenz']},
		{name: 'impfstelle', elements:['alle','zentral','aerzte'], ignore: (date < '2021-04-08') || (date >= '2021-06-07')},
		{name: 'alter', elements:['alle','<60','60+'], optional:true, ignore: (date < '2021-04-08') || (date >= '2021-06-07')},
		{name: 'alter', elements:['alle','<18','18-59','60+'], optional:true, ignore: (date < '2021-06-07') || (date >= '2021-07-26') },
		{name: 'alter', elements:['alle','<12','12-17','<18','18-59','60+'], optional:true, ignore: (date < '2021-07-26')},
	].filter(d => !d.ignore);

	const dimensionNames = dimensions.map(d => d.name);
	const dimensionsLookup = new Map(dimensions.map(d => [d.name,d]));

	const slices = [
		{dimensions:new Set(['dosis','hersteller']), ignore: (date >= '2021-04-08') && (date < '2021-06-07')},
		{dimensions:new Set(['dosis','hersteller','impfstelle']), ignore: (date < '2021-04-08') || (date >= '2021-06-07')},
		{dimensions:new Set(['dosis','alter','impfstelle']), ignore: (date < '2021-04-08') || (date >= '2021-06-07')},
		{dimensions:new Set(['dosis','indikation']), optional: date >= '2021-04-08'},
		{dimensions:new Set(['dosis','quote'])},
		{dimensions:new Set(['dosis','quote','alter']), ignore: (date < '2021-04-08')},
		{dimensions:new Set(['dosis','kumulativ'])},
		{dimensions:new Set(['dosis','kumulativ','impfstelle']), ignore: (date < '2021-04-08')},
	].filter(d => !d.ignore);

	const regions = [
		{code:'BW', pop:date<'2021-08-30'?11100394:11103043, title:'Baden-Württemberg'},
		{code:'BY', pop:date<'2021-08-30'?13124737:13140183, title:'Bayern'},
		{code:'BE', pop:date<'2021-08-30'? 3669491: 3664088, title:'Berlin'},
		{code:'BB', pop:date<'2021-08-30'? 2521893: 2531071, title:'Brandenburg'},
		{code:'HB', pop:date<'2021-08-30'?  681202:  680130, title:'Bremen'},
		{code:'HH', pop:date<'2021-08-30'? 1847253: 1852478, title:'Hamburg'},
		{code:'HE', pop:date<'2021-08-30'? 6288080: 6293154, title:'Hessen'},
		{code:'MV', pop:date<'2021-08-30'? 1608138: 1610774, title:'Mecklenburg-Vorpommern'},
		{code:'NI', pop:date<'2021-08-30'? 7993608: 8003421, title:'Niedersachsen'},
		{code:'NW', pop:date<'2021-08-30'?17947221:17925570, title:'Nordrhein-Westfalen'},
		{code:'RP', pop:date<'2021-08-30'? 4093903: 4098391, title:'Rheinland-Pfalz'},
		{code:'SL', pop:date<'2021-08-30'?  986887:  983991, title:'Saarland'},
		{code:'SN', pop:date<'2021-08-30'? 4071971: 4056941, title:'Sachsen'},
		{code:'ST', pop:date<'2021-08-30'? 2194782: 2180684, title:'Sachsen-Anhalt'},
		{code:'SH', pop:date<'2021-08-30'? 2903773: 2910875, title:'Schleswig-Holstein'},
		{code:'TH', pop:date<'2021-08-30'? 2133378: 2120237, title:'Thüringen'},
		{code:'DE', pop:date<'2021-08-30'?83166711:83155031, title:'Deutschland'},
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

		if (dimensionsLookup.has('impfstelle')) {
			switch (cell.impfstelle) {
				case 'alle':break;
				case 'zentral': suffix += '_impfstelle_zentral'; break;
				case 'aerzte': suffix += '_impfstelle_aerzte'; break;
				default: throw Error();
			}
		}

		if (dimensionsLookup.has('alter')) {
			switch (cell.alter) {
				case 'alle':break;
				case '<12':   suffix += '_alter_unter12'; break;
				case '12-17': suffix += '_alter_12bis17'; break;
				case '<18':   suffix += '_alter_unter18'; break;
				case '18-59': suffix += '_alter_18bis59'; break;
				case '<60':   suffix += '_alter_unter60'; break;
				case '60+':   suffix += '_alter_60plus'; break;
				default: throw Error();
			}
		}

		if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',hersteller:'!0'})) return [cell.dosis === 'dosen' ? 'dosen' : 'personen_'+cell.dosis, cell.hersteller, 'kumulativ'].join('_')+suffix;
		
		if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',indikation:'!0'})) return ['indikation', cell.indikation, cell.dosis].join('_')+suffix;
		
		if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*'})) {
			if (cell.dosis === 'dosen') return 'dosen_kumulativ'+suffix;
			return 'personen_'+cell.dosis+'_kumulativ'+suffix;
		}

		if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',kumulativ:'differenz'})) {
			if (cell.dosis === 'dosen') return 'dosen_differenz_zum_vortag'+suffix;
			return 'personen_'+cell.dosis+'_differenz_zum_vortag'+suffix;
		}

		if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',quote:'impf_quote'   })) return 'impf_quote_'+cell.dosis+suffix;
		if (cellIsIn({dosis:'*',impfstelle:'*',alter:'*',quote:'impf_inzidenz'})) return 'impf_inzidenz_'+cell.dosis+suffix;

		console.log(cell);
		console.log(dimensionNames.map(d => cell[d]).join(','));
		throw Error('unknown slug');

		function cellIsIn(query) {
			query = getQuery(query);
			if (!query) return false;
			return dimensionNames.every(d => query[d].has(cell[d]));

			function getQuery(query) {
				let key = JSON.stringify(query);
				if (cellQueryCache.has(key)) return cellQueryCache.get(key);
				let obj = calcQuery(query);
				cellQueryCache.set(key,obj);
				return obj;
			}

			function calcQuery(query) {
				for (let key of Object.keys(query)) {
					if (dimensionsLookup.has(key)) continue;
					switch (query[key]) {
						case '*': continue;
						default:
							console.log(query);
							console.log(key);
							throw Error();
					}
				}

				let obj = {};
				dimensions.forEach(d => {
					if (query[d.name] === undefined) return obj[d.name] = new Set(d.elements.slice(0,1));
					if (query[d.name] === '*'      ) return obj[d.name] = new Set(d.elements);
					if (query[d.name] === '!0'     ) return obj[d.name] = new Set(d.elements.slice(1));
					return obj[d.name] = new Set(query[d.name].split(','));
				});
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