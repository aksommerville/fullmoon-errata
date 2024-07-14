const fs = require("fs/promises");
const readline = require("readline/promises");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/* The main event.
 * (w) must be long enough to support the longest answer. See below.
 * Returns {
 *   letters: string. Space between columns, and newlines between rows.
 *   holes: string with exactly the same shape as (letters), but '.' for opaque cells and 'O' for holes.
 * }
 */
function generatePuzzle(w, answers) {

  /* Make two scratch arrays, each containing every cell as a one-character string.
   * I'm using pipe in (letters) as "unassigned", since it's unlikely to be part of the alphabet.
   * Spaces are a real thing in (letters).
   */
  const cellc = w * w;
  const holec = (cellc - 2 * w) / 8;
  const letters = [];
  const holes = [];
  for (let i=cellc; i-->0; ) {
    letters.push('|');
    holes.push(' ');
  }
  
  /* Disqualify the holes that can transform into themselves.
   * Because (w) must be even, this means only the diagonals.
   */
  for (let x=0; x<w; x++) {
    holes[x * w + x] = '.';
    holes[(x + 1) * w - 1 - x] = '.';
  }
  
  /* Helpers for the next stage, assigning holes.
   */
  const disqualifyAssert = (x, y) => {
    if ((x < 0) || (y < 0) || (x >= w) || (y >= w)) throw new Error(`Invalid assignment to ${x},${y}, w=${w}`);
    const p = y * w + x;
    if (holes[p] === '.') return; // Fine if it's already disqualified.
    if (holes[p] !== ' ') throw new Error(`Invalid assignment to ${x},${y}, already visited.`);
    holes[p] = '.';
  };
  const disqualifyIf = (x, y) => {
    if ((x < 0) || (y < 0) || (x >= w) || (y >= w)) return;
    const p = y * w + x;
    if (holes[p] !== ' ') return;
    holes[p] = '.';
  };
  
  /* Distribute the holes randomly.
   * Each time we assign one, disqualify the 7 cells that it transforms to,
   * and also the 8 adjacent to it, if not assigned yet.
   * To keep things simple, I'm searching from scratch for each hole. Less efficient than it could be.
   */
  for (let i=0; i<holec; i++) {
    let candidatec = 0;
    for (let j=cellc; j-->0; ) {
      if (holes[j] === ' ') candidatec++;
    }
    if (!candidatec) {
      // With the disqualifying-neighbors rule, I'm really not sure whether this can happen or not.
      throw new Error(`Ran out of hole candidates after assigning ${i}/${holec}! This wasn't supposed to be possible. Please try again.`);
    }
    let choice = Math.floor(Math.random() * candidatec);
    for (let j=cellc; j-->0; ) {
      if (holes[j] === ' ') {
        if (!choice--) {
          holes[j] = 'O';
          const x = j % w;
          const y = Math.floor(j / w);
          disqualifyAssert(w - x - 1, y);
          disqualifyAssert(x, w - y - 1);
          disqualifyAssert(w - x - 1, w - y - 1);
          disqualifyAssert(y, x);
          disqualifyAssert(w - y - 1, x);
          disqualifyAssert(y, w - x - 1);
          disqualifyAssert(w - y - 1, w - x - 1);
          disqualifyIf(x - 1, y - 1);
          disqualifyIf(x    , y - 1);
          disqualifyIf(x + 1, y - 1);
          disqualifyIf(x - 1, y    );
          disqualifyIf(x + 1, y    );
          disqualifyIf(x - 1, y + 1);
          disqualifyIf(x    , y + 1);
          disqualifyIf(x + 1, y + 1);
          break;
        }
      }
    }
  }
  
  /* We should now have visited every hole. Verify.
   */
  const holeCoords = []; // [x,y] for each hole before any transform
  for (let i=0; i<cellc; i++) {
    if (holes[i] === 'O') holeCoords.push([i % w, Math.floor(i / w)]);
    else if (holes[i] !== '.') throw new Error(`Hole ${i % w},${Math.floor(i / w)} did not get assigned`);
  }
  if (holeCoords.length !== holec) throw new Error(`Expected to punch ${holec} holes but actually did ${holeCoords.length}, w=${w}`);
  
  /* Put each answer on the board, alternating between starting at the first hole and the last.
   * It wouldn't do to start them all at the beginning, because if there are disparate lengths, that would put all the spaces at the end.
   * *** update: That shouldn't matter anymore; we're forcing uniform length at the point of collection.
   * Of course, the ideal answer set has answers of uniform length, matching the grid's maximum.
   * The low (only!) three bits of (ai) define the transform.
   * Also, kind of a pain... we need to pre-transform holeCoords each time, and sort them back into LRTB order.
   */
  for (let ai=answers.length; ai-->0; ) {
    const coords = holeCoords.map(([x, y]) => {
      if (ai & 1) x = w - x - 1;
      if (ai & 2) y = w - y - 1;
      if (ai & 4) { const tmp = x; x = y; y = tmp; }
      return [x, y];
    });
    coords.sort((a, b) => {
      if (a[1] < b[1]) return -1;
      if (a[1] > b[1]) return 1;
      return a[0] - b[0];
    });
    const answer = answers[ai];
    let hcp = (ai & 1) ? 0 : (coords.length - answer.length);
    for (let i=0; i<answer.length; i++) {
      let [x, y] = coords[hcp++];
      const lp = y * w + x;
      if (letters[lp] !== '|') throw new Error(`Letter position ${x},${y} already assigned.`);
      letters[lp] = answer[i];
    }
  }
  
  /* Replace every pipe in (letters) with a random letter from those used in (answers).
   * Don't invent new letters; the caller might have alphabet constraints for his own reasons.
   * With the answer padding that i added later, the only remaining unset letters should be the invalid diagonals.
   */
  let alphabet = new Set();
  for (const answer of answers) {
    for (const ch of answer) {
      alphabet.add(ch);
    }
  }
  alphabet = Array.from(alphabet);
  for (let i=cellc; i-->0; ) {
    if (letters[i] !== '|') continue;
    // This is super hard to validate manually! Make it easier by emitting fake noise letters.
    //letters[i] = ',';
    letters[i] = alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  
  /* Format and return.
   */
  let ls="", hs="";
  for (let y=0, p=0; y<w; y++) {
    for (let x=0; x<w; x++, p++) {
      ls += ' ';
      ls += letters[p];
      hs += ' ';
      hs += holes[p];
    }
    ls += '\n';
    hs += '\n';
  }
  return { letters: ls, holes: hs };
}

/* length=(w**2-2*w)/8
 * The divide by eight means each hole is unique across all 8 transforms.
 * That formula is only valid for even (w); odd ones you'd have to eliminate the middle column and row.
 * Since you don't actually get more available cells for the odd lengths, we don't use them at all.
 */
function calculateMinimumWidthForAnswerLength(length) {
  // I guess we could solve this properly by employing the quadratic formula. Huh.
  // But this isn't a math class, and CPU cycles are cheap.
  for (let w=4; ; w+=2) {
    const maxLength = (w ** 2 - 2 * w) / 8;
    if (length <= maxLength) return w;
    // We allow up to 38 wide, which yields a maximum length of 171.
    if (w >= 40) throw new Error(`Answer length ${length} is just too large, sorry.`);
  }
}

async function main() {

  /*XXX it's getting old, typing these 8 spells each time i test something...
  const answers = [];
  for (;;) {
    const answer = await rl.question("Next answer or empty to finish: ");
    if (!answer) break;
    if (answer.indexOf('|') >= 0) throw new Error(`Please don't use pipe; we use it as a placeholder (and it looks like I or 1)`);
    answers.push(answer);
    // 8 is not an arbitrary limit: There can't be more answers than there are fixed-axis transforms. (and you should give either exactly 8 or 4).
    if (answers.length >= 8) break;
  }
  /**/
  const answers = [
    "LRL_UUD",
    "L_D_LDR",
    "ULDURD",
    "RULDRL?",
    "LRLUU",
    "UDUDLLR",
    "LUDRLLRR",
    "RLLRLLDL",
  ];
  
  const length = answers.map(a => a.length).reduce((a, v) => Math.max(a, v), 0);
  if (!length) {
    console.log(`No answers. Terminating.`);
    return;
  }
  // Could prompt for width and allow the user to go larger than necessary. I see no point to that.
  const minWidth = calculateMinimumWidthForAnswerLength(length);
  const w = minWidth; //+await rl.question(`Minimum width ${minWidth}: `);
  if (!w || (w < minWidth) || (w & 1)) {
    console.log(`Invalid width ${JSON.stringify(w)}. Terminating.`);
    return;
  }
  // Pad answers with spaces, fore or aft alternating.
  const holec = (w * w - 2 * w) / 8;
  for (let i=answers.length; i-->0; ) {
    if (answers[i].length >= holec) continue;
    const pad = "                           ".substring(0, holec - answers[i].length);
    if (i & 1) answers[i] = answers[i] + pad;
    else answers[i] = pad + answers[i];
  }
  // OK do it.
  const result = generatePuzzle(w, answers);
  //console.log(JSON.stringify(result));
  console.log(`=== LETTERS ===`);
  console.log(result.letters);
  console.log(`=== HOLES ===`);
  console.log(result.holes);
}

main().then(() => {
  rl.close();
});
