#!/usr/bin/env node

"use strict"

const fs = require('fs');
const {resolve} = require('path');
const crypto = require('crypto');



const dirSrc = resolve(__dirname, '../data/0_archived/');



let files = [];
fs.readdirSync(dirSrc).forEach(filename => {
	if (!/impfquotenmonitoring-202.*\.xlsx/.test(filename)) return;

	filename = resolve(dirSrc, filename);
	const hash = crypto.createHash
	('sha256').update(fs.readFileSync(filename)).digest('hex');

	files.push({ filename, hash });
})

files.sort((a,b) => a.hash.localeCompare(b.hash) || a.filename.localeCompare(b.filename));

let lastHash = false;
files = files.filter(f => lastHash === (lastHash = f.hash));

files.forEach(f => fs.rmSync(f.filename));