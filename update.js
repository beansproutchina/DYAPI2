#!/usr/bin/env node
import { execSync } from 'child_process'
import { readdirSync, readFileSync, existsSync, unlinkSync, copyFileSync } from 'fs'
import { resolve } from 'path'
import { env } from 'process'

export const update = () => {
    for (let i of readdirSync(import.meta.dirname + '/dyapi')) {
        CopyFileReplace(import.meta.dirname + '/dyapi/' + i, resolve(`./dyapi/${i}`))
    }
    for (let i of readdirSync(import.meta.dirname + '/config')) {
        CopyFileDontReplace(import.meta.dirname + '/config/' + i, resolve(`./config/${i}`))
    }

    CopyFileReplace(import.meta.dirname + '/index.js', resolve(`./index.js`));
    let packageJSON = JSON.parse(readFileSync(import.meta.dirname + '/package.json').toString());
    console.log(`📦 Installing Dependencies...`)
    for (let [key, val] of Object.entries(packageJSON.dependencies)) {
        console.log(`  - Installing ${key}...`);
        execSync(`npm install ${key}@${val}`)
    }
}

const CopyFileReplace = (src, dest) => {
    if (existsSync(dest)) {
        unlinkSync(dest)
    }
    copyFileSync(src, dest)
}

const CopyFileDontReplace = (src, dest) => {
    if (existsSync(dest)) {
        if (existsSync(dest + ".new")) {
            unlinkSync(dest + ".new");
        }
        dest = dest + ".new";
        console.log(`⚠️  File ${dest} already exists, new version is saved to ${dest}.new`)
    }
    copyFileSync(src, dest)
}


if (process.argv[1].endsWith("update.js")) {
    update();
    console.log('✌update successfully!');
}
