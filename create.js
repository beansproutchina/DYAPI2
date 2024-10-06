#!/usr/bin/env node
import { existsSync, mkdirSync, copyFileSync, constants } from 'fs';
import { resolve } from 'path';
import { exit } from 'node:process';
import { update as _update } from './update.js';

console.log('🚀Creating Project...')
if (existsSync(resolve('./index.js'))) {
    console.log('😔Failed: index.js already exists');
    exit(0);
}
mkdirSync(resolve(`./config`));
mkdirSync(resolve(`./data`));
mkdirSync(resolve(`./dyapi`));


_update();

console.log(`✌Project Created Successfully!`)