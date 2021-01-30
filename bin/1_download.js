#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const https = require('https');



const url = 'https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquotenmonitoring.xlsx?__blob=publicationFile';



(async () => {
	let date = (new Date()).toISOString().slice(0,19).replace(/[T:]/g,'-');
	let data = await fetch(url);
	fs.writeFileSync(resolve(__dirname, '../data/0_original/impfquotenmonitoring-'+date+'.xlsx'), data);
})()



function fetch(url) {
	return new Promise(resolve => {
		https.get(url, {timeout:10*1000}, res => {
			let buffers = [];
			res.on('data', chunk => buffers.push(chunk));
			if (res.statusCode !== 200) {
				console.log(url, res.statusCode, res.statusMessage);
				return reject();
			}
			res.on('error', () => reject())
			res.on('end', () => resolve(Buffer.concat(buffers)));
		}).on('error', () => reject())
	})
}
