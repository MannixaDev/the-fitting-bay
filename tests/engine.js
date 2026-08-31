/* Loads the browser engine into Node. fitting-engine.js attaches itself to a
   global `window`, and deliberately contains no DOM code, so this is all it
   takes to test it. */
'use strict';

const path = require('path');

global.window = global.window || {};
require(path.join(__dirname, '..', 'js', 'fitting-engine.js'));

module.exports = global.window.GolfFit;
