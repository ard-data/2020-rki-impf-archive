#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const validator = require('../lib/validator.js');



const dirSrc = resolve(__dirname, '../data/1_parsed/');
const dirDst = resolve(__dirname, '../data/2_completed/');

fs.readdirSync(dirSrc).sort((a,b) => a < b ? 1 : -1).forEach(filename => {
	let fullnameSrc = resolve(dirSrc, filename);
	let fullnameDst = resolve(dirDst, filename);

	if (fs.existsSync(fullnameDst)) return;

	let data = JSON.parse(fs.readFileSync(fullnameSrc));

	validator.complete(data);

	fs.writeFileSync(fullnameDst, JSON.stringify(data, null, '\t'));
})
