#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   bump.js — keep the generated bits of the site in step with its contents.

     1. rewrites the ?v= cache-busters from a hash of each asset
     2. regenerates sitemap.xml from the pages that actually exist

   The site has no build step and none is wanted, but hand-editing ?v=N is the
   kind of thing that gets forgotten exactly once and then serves stale JS
   against new HTML — and a hand-kept sitemap with a stale lastmod is worse
   than no sitemap at all.

       node tools/bump.js          rewrite in place
       node tools/bump.js --check  exit 1 if anything is out of date (for CI)

   A pre-commit hook runs it. Enable once per clone:
       git config core.hooksPath .githooks
   --------------------------------------------------------------------------- */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');

const SITE = 'https://fittingbay.com';
const ASSETS = ['css/styles.css', 'js/fitting-engine.js', 'js/app.js', 'js/lie-bench.js'];
const PAGES = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
const NL = String.fromCharCode(10);

let stale = 0;

/* ---------------------------------------------------------------- cache-busters */
function hash(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

const hashes = {};
ASSETS.forEach((a) => { hashes[a] = hash(a); });

PAGES.forEach((page) => {
  const file = path.join(root, page);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  ASSETS.forEach((asset) => {
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
    if (check) console.error('stale: ' + page);
    else { fs.writeFileSync(file, after); console.log('updated: ' + page); }
  }
});

/* ---------------------------------------------------------------- sitemap */
function sitemapXml() {
  const urls = PAGES.slice().sort().map((page) => {
    const when = fs.statSync(path.join(root, page)).mtime.toISOString().slice(0, 10);
    const loc = page === 'index.html' ? SITE + '/' : SITE + '/' + page;
    return [
      '  <url>',
      '    <loc>' + loc + '</loc>',
      '    <lastmod>' + when + '</lastmod>',
      '    <changefreq>monthly</changefreq>',
      '    <priority>' + (page === 'index.html' ? '1.0' : '0.8') + '</priority>',
      '  </url>'
    ].join(NL);
  }).join(NL);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    ''
  ].join(NL);
}

const sitemapPath = path.join(root, 'sitemap.xml');
const wanted = sitemapXml();
const current = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';

if (current !== wanted) {
  stale++;
  if (check) console.error('stale: sitemap.xml');
  else { fs.writeFileSync(sitemapPath, wanted); console.log('updated: sitemap.xml'); }
}

/* ---------------------------------------------------------------- report */
if (check) {
  if (stale) {
    console.error(NL + stale + ' generated file(s) out of date. Run: node tools/bump.js');
    process.exit(1);
  }
  console.log('generated files up to date');
} else if (!stale) {
  console.log('nothing to do — already current');
} else {
  Object.keys(hashes).forEach((a) => console.log('  ' + a + ' -> ' + hashes[a]));
}
