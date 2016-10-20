'use strict'; // eslint-disable-line

const glob = require('glob');
const path = require('path');

const step = {};
glob.sync('*.js', {
  cwd: path.join(__dirname, 'steps'),
  realpath: true,
}).forEach((file) => {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  step[path.basename(file, '.js')] = require(file);
});

module.exports = step;
