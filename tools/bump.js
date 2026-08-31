#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   bump.js — rewrite the ?v= cache-busters from file contents.

   The site has no build step and none is wanted, but hand-editing ?v=N is the
   kind of thing that gets forgotten exactly once and then serves stale JS
   against new HTML. This hashes each asset and stamps the hash into every
   HTML file that references it.

       node tools/bump.js          rewrite in place
       node tools/bump.js --check  exit 1 if anything is out of date (for CI)

   Run it before committing. Or wire it to a pre-commit hook:
       git config core.hooksPath .githooks
   --------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');

const ASSETS = ['css/styles.css', 'js/fitting-engine.js', 'js/app.js'];
const PAGES = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

function hash(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

const hashes = {};
ASSETS.forEach((a) => { hashes[a] = hash(a); });

let stale = 0;
PAGES.forEach((page) => {
  const file = path.join(root, page);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  ASSETS.forEach((asset) => {
    // matches href="css/styles.css?v=anything" and src="js/app.js?v=anything"
    const re = new RegExp('(' + asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(\\?v=[A-Za-z0-9]+)?', 'g');
    after = after.replace(re, (m, p1, p2, offset) => {
      // only rewrite inside an attribute, not in prose
      const ctx = after.slice(Math.max(0, offset - 8), offset);
      if (!/(href|src)="$/.test(ctx)) return m;
      return p1 + '?v=' + hashes[asset];
    });
  });

  if (after !== before) {
    stale++;
    if (check) {
      console.error('stale: ' + page);
    } else {
      fs.writeFileSync(file, after);
      console.log('updated: ' + page);
    }
  }
});

if (check) {
  if (stale) {
    console.error('\n' + stale + ' file(s) have stale cache-busters. Run: node tools/bump.js');
    process.exit(1);
  }
  console.log('cache-busters up to date');
} else if (!stale) {
  console.log('nothing to do — already current');
} else {
  Object.keys(hashes).forEach((a) => console.log('  ' + a + ' -> ' + hashes[a]));
}
