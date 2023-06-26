#!/usr/bin/env node
const fs = require("fs");

const entries = [];
const sessions = [];
const keys = new Set();

function ingestFile(path, host, startTime) {
  const session = { path, host, startTime, events: [] };
  sessions.push(session);
  const src = fs.readFileSync(path);
  for (let srcp=0, lineno=1; srcp<src.length; lineno++) {
    const linep = srcp;
    let linec = 0;
    while ((srcp < src.length) && (src[srcp++] !== 0x0a)) linec++;
    const line = src.toString("utf8", linep, linep + linec);
    
    // 9524:572+0:9516533@1,0,0;map 1
    // (game time ms):(framec)+(skipc):(real time us)@(mapid),(herox),(heroy);(key) (message)
    const match = line.match(/^(\d+):(\d+)\+(\d+):(\d+)@(\d+),(\d+),(\d+);([^ ]*) (.*)$/);
    if (!match) {
      throw new Error(`${path}:${lineno}: Malformed line ${JSON.stringify(line)}`);
      // or more likely, "malformed regex"
    }
    const entry = {
      host,
      startTime,
      gameTimeMs: +match[1],
      framec: +match[2],
      skipc: +match[3],
      realTimeUs: +match[4],
      mapid: +match[5],
      herox: +match[6],
      heroy: +match[7],
      key: match[8],
      message: match[9],
    }
    
    entries.push(entry);
    session.events.push({...entry});
    keys.add(entry.key);
  }
}

const rawPath = "raw";
for (const base of fs.readdirSync(rawPath)) {
  const [host, startTime] = base.split(/[-\.]/g);
  ingestFile(rawPath + "/" + base, host, startTime);
}

console.log(`Found ${entries.length} entries in ${sessions.length} sessions.`);
console.log(`Unique keys: ${Array.from(keys)}`);
