#!/usr/bin/env node
const fs = require("fs");

const sessions = [];
const keys = new Set();
let fileCount = 0;

function ingestFile(path, host, startTime) {
  fileCount++;
  let session = null;
  let indexInFile = 0;
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
    
    if (!session) {
      session = { path, host, startTime, indexInFile: indexInFile++, events: [] };
      sessions.push(session);
    }
    
    session.events.push(entry);
    keys.add(entry.key);
    
    // "idle-restart" and "kill-werewolf" are the last events in a session.
    if ((entry.key === "idle-restart") || (entry.key === "kill-werewolf")) {
      session = null;
    }
  }
}

const rawPath = "raw";
for (const base of fs.readdirSync(rawPath)) {
  const [host, startTime] = base.split(/[-\.]/g);
  ingestFile(rawPath + "/" + base, host, startTime);
}

console.log(`Found ${sessions.length} sessions in ${fileCount} files.`);
console.log(`Unique keys: ${Array.from(keys)}`);

/*********************************************************************************
 * Add some summary fields to each session.
 * Existing: { path, host, startTime, indexInFile: indexInFile++, events: [] };
 * Add: {
 *   duration: ms, game time
 *   disposition: "idle-restart" | "kill-werewolf" | "quit"
 *   maps: { mapid, duration, count }[]
 *   injuries: {
 *     key: "injury" | "grievous-injury" | "hero-kill"
 *     location: [mapid,x,y]
 *   }[]
 *   items: (0..15)[], in chronological order
 * }
 */
 
for (const session of sessions) {
  if (session.events.length < 2) {
    throw new Error(`Too few events in session ${JSON.stringify(session)}`);
  }
  const lastEvent = session.events[session.events.length - 1];
  
  session.duration = lastEvent.gameTimeMs - session.events[0].gameTimeMs;
  switch (lastEvent.key) {
    case "idle-restart":
    case "kill-werewolf": {
        session.disposition = lastEvent.key;
      } break;
    default: session.disposition = "quit";
  }
  session.maps = [];
  session.injuries = [];
  session.items = [];
  
  let lastMapId = 0;
  let lastMapTime = 0;
  for (const event of session.events) {
    switch (event.key) {
      case "item-first": session.items.push(+(event.message.split("*")[0])); break;
      case "injury":
      case "grievous-injury":
      case "hero-kill": {
          session.injuries.push({ key: event.key, location: [event.mapid, event.herox, event.heroy] });
        } break;
    }
    if (event.mapid !== lastMapId) {
      if (lastMapId) {
        let record = session.maps.find(r => r.mapid === event.mapid);
        if (!record) {
          record = { mapid: event.mapid, duration: 0, count: 0 };
          session.maps.push(record);
        }
        record.duration += event.gameTimeMs - lastMapTime;
        record.count++;
      }
      lastMapId = event.mapid;
      lastMapTime = event.gameTimeMs;
    }
  }
  if (lastMapId) {
    let record = session.maps.find(r => r.mapid === lastEvent.mapid);
    if (!record) {
      record = { mapid: lastEvent.mapid, duration: 0, count: 0 };
      session.maps.push(record);
    }
    record.duration += lastEvent.gameTimeMs - lastMapTime;
    record.count++;
  }
}

/**********************************************************************************
 * Dump a table, one line per session, just the key facts.
 * {
 *   path, host, startTime, indexInFile, events,
 *   duration, disposition, maps, injuries, items,
 * }
 *
function fmtTime(ms) {
  let sec = Math.floor(ms / 1000); ms %= 1000;
  let min = Math.floor(sec / 60); sec %= 60;
  if (min < 10) min = "0" + min;
  if (sec < 10) sec = "0" + sec;
  if (ms < 10) ms = "00" + ms;
  else if (ms < 100) ms = "0" + ms;
  return `${min}:${sec}.${ms}`;
}
for (const session of sessions) {
  let disposition = "????";
  switch (session.disposition) {
    case "idle-restart": disposition = "idle"; break;
    case "kill-werewolf": disposition = "kill"; break;
    case "quit": disposition = "quit"; break;
  }
  console.log(`${session.host[0]} ${fmtTime(session.duration)} ${disposition} injuries=${session.injuries.length} items=${session.items.length} maps=${session.maps.length}`);
}
/**/

/**********************************************************************************
 * Dump report to a JSON file, and let editor take it from there.
 * We could strip `events` from each session to reduce the size considerably.
 * As is, the report is huge, 2.8 MB, and it contains the entire input.
 */
const report = JSON.stringify({
  sessions,
});
const dstpath = "fullmoon-gdex-report.json";
fs.writeFileSync(dstpath, report);
console.log(`${dstpath}: Wrote report`);
/**/
