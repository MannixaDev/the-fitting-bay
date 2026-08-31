/* ---------------------------------------------------------------------------
   harness.js — a test runner in eighty lines, because the project has no
   dependencies and is not about to grow some for this.

   Usage:
     const { suite, test, assert, equal, near, report } = require('./harness');
   --------------------------------------------------------------------------- */
'use strict';

const state = { suite: '(root)', test: null, pass: 0, fail: 0, failures: [], sweeps: [] };

function suite(name, fn) {
  state.suite = name;
  fn();
  state.suite = '(root)';
}

function test(name, fn) {
  state.test = name;
  try {
    fn();
    state.pass++;
  } catch (err) {
    state.fail++;
    state.failures.push({ suite: state.suite, test: name, message: err.message });
  }
  state.test = null;
}

/* A sweep is one test that runs many cases. It reports the case count so the
   summary reflects the real coverage, and stops after 5 distinct failures so
   the output stays readable. */
function sweep(name, cases, fn) {
  state.test = name;
  let n = 0, bad = 0;
  const shown = [];
  for (const c of cases) {
    n++;
    try {
      fn(c);
    } catch (err) {
      bad++;
      if (shown.length < 5) shown.push(describe(c) + ' — ' + err.message);
    }
  }
  state.sweeps.push({ name, n, bad });
  if (bad) {
    state.fail++;
    state.failures.push({
      suite: state.suite, test: name,
      message: bad + ' of ' + n + ' cases failed:\n        ' + shown.join('\n        ')
    });
  } else {
    state.pass++;
  }
  state.test = null;
}

function describe(c) {
  try {
    return typeof c === 'object' ? JSON.stringify(c) : String(c);
  } catch (e) { return '(case)'; }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

function equal(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) +
      ', got ' + JSON.stringify(actual));
  }
}

function near(actual, expected, tolerance, msg) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + expected + ' ±' + tolerance +
      ', got ' + actual);
  }
}

/* Catches the class of bug that produces "you are undefined° too flat". */
function noPlaceholders(value, msg) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  const m = s && s.match(/undefined|NaN|\[object Object\]/);
  if (m) throw new Error((msg ? msg + ': ' : '') + 'found "' + m[0] + '" in output');
}

function report() {
  const totalCases = state.sweeps.reduce((n, s) => n + s.n, 0);
  console.log('');
  if (state.failures.length) {
    console.log('FAILURES\n');
    state.failures.forEach((f) => {
      console.log('  ✗ ' + f.suite + ' › ' + f.test);
      console.log('      ' + f.message + '\n');
    });
  }
  console.log('  ' + state.pass + ' passed, ' + state.fail + ' failed' +
    (totalCases ? '  (' + totalCases.toLocaleString('en-GB') + ' generated cases across ' +
      state.sweeps.length + ' sweeps)' : ''));
  console.log('');
  return state.fail === 0;
}

module.exports = { suite, test, sweep, assert, equal, near, noPlaceholders, report, state };
