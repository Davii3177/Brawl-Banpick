#!/usr/bin/env node
'use strict';
/**
 * SRT -> deduplicated plain text with a retained timestamp index.
 *
 * YouTube auto-captions are "rolling": each cue repeats the tail of the previous
 * one, so a 28-minute video yields ~70KB of mostly duplicated text. This walks
 * the cues and appends only the genuinely new suffix of each, which typically
 * cuts size by 55-65% without losing a word.
 *
 * Timestamps are preserved as [MM:SS] markers roughly every SPAN seconds, because
 * every extracted claim must cite a locator a human can jump to and verify.
 *
 *   node srt2text.js <in.srt> [out.txt]
 */
const fs = require('fs');

const SPAN = 30; // seconds between emitted timestamp markers

function parseSrt(src) {
  const cues = [];
  // Blocks separated by blank lines: index / timing / text...
  for (const block of src.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) continue;
    const m = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->/.exec(timing);
    if (!m) continue;
    const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    const text = lines.slice(lines.indexOf(timing) + 1).join(' ')
      .replace(/<[^>]*>/g, '')          // inline tags
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) cues.push({ start, text });
  }
  return cues;
}

/** Append only the part of `next` not already at the tail of `buf`. */
function appendNew(bufWords, nextWords) {
  const maxOverlap = Math.min(bufWords.length, nextWords.length, 40);
  for (let k = maxOverlap; k > 0; k--) {
    let same = true;
    for (let i = 0; i < k; i++) {
      if (bufWords[bufWords.length - k + i] !== nextWords[i]) { same = false; break; }
    }
    if (same) return nextWords.slice(k);
  }
  return nextWords;
}

function convert(src) {
  const cues = parseSrt(src);
  if (!cues.length) return { text: '', cues: 0, seconds: 0 };

  const words = [];
  const marks = [];           // {wordIndex, seconds}
  let nextMark = 0;

  for (const cue of cues) {
    const add = appendNew(words, cue.text.split(' ').filter(Boolean));
    if (!add.length) continue;
    if (cue.start >= nextMark) {
      marks.push({ at: words.length, t: cue.start });
      nextMark = cue.start + SPAN;
    }
    words.push(...add);
  }

  // Re-assemble, injecting [MM:SS] at recorded word offsets.
  let out = '';
  let mi = 0;
  for (let i = 0; i < words.length; i++) {
    while (mi < marks.length && marks[mi].at === i) {
      const t = marks[mi].t;
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String(t % 60).padStart(2, '0');
      out += `\n[${mm}:${ss}] `;
      mi++;
    }
    out += words[i] + ' ';
  }

  return {
    text: out.trim() + '\n',
    cues: cues.length,
    words: words.length,
    seconds: cues[cues.length - 1].start
  };
}

if (require.main === module) {
  const [inFile, outFile] = process.argv.slice(2);
  if (!inFile) { console.error('usage: srt2text.js <in.srt> [out.txt]'); process.exit(1); }
  const src = fs.readFileSync(inFile, 'utf8');
  const r = convert(src);
  const dest = outFile || inFile.replace(/\.[^.]*\.srt$/, '.txt').replace(/\.srt$/, '.txt');
  fs.writeFileSync(dest, r.text);
  const before = Buffer.byteLength(src);
  const after = Buffer.byteLength(r.text);
  console.log(`${inFile}\n  cues=${r.cues} words=${r.words} dur=${Math.round(r.seconds / 60)}min  ${before}B -> ${after}B (${Math.round((1 - after / before) * 100)}% smaller)`);
}

module.exports = { convert, parseSrt };
