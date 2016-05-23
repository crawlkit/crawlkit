'use strict'; // eslint-disable-line

const glob = require('glob');
const path = require('path');
const step = {};
glob.sync('*.js', {
  cwd: path.join(__dirname, 'steps'),
  realpath: true,
}).forEach((file) => {
  step[path.basename(file, '.js')] = require(file); // eslint-disable-line global-require
});

module.exports = step;
