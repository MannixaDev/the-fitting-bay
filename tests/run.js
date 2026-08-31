#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   run.js — the whole test suite.

       node tests/run.js

   Exits non-zero on failure, so it works in a hook or in CI. No dependencies,
   no config, no watch mode: the engine is pure functions and this is enough.
   --------------------------------------------------------------------------- */
'use strict';

const { report } = require('./harness');

const SUITES = ['./fit.test.js', './audit.test.js', './regressions.test.js'];

const started = Date.now();
console.log('\nThe Fitting Bay — test suite');

SUITES.forEach((file) => {
  const run = require(file);
  run();
});

const ok = report();
console.log('  ' + ((Date.now() - started) / 1000).toFixed(2) + 's\n');
process.exit(ok ? 0 : 1);
