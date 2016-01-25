'use strict'; // eslint-disable-line

const debug = require('debug');

const types = ['debug', 'info', 'error'];

module.exports = (prefix) => {
  const logger = {};
  types.forEach((type) => {
    logger[type] = debug(`${prefix || ''}:${type}`);
  });
  return logger;
};
