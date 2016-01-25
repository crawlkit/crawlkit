'use strict'; // eslint-disable-line

const NanoTimer = require('nanotimer');
const juration = require('juration');

/**
* Runs a function and times it
*
* @private
* @param {!Object} logger A {@link logger} object
* @param {!Function} runFn The function to run
* @return {Function} a function to start the processing. Takes an optional callback parameter.
*/
module.exports = (logger, runFn) => (cb) => {
    new NanoTimer().time(runFn, '', 's', (time) => {
        logger.info(`Finished. Took ${juration.stringify(time) || 'less than a second'}.`);
        if (typeof cb === 'function') {
            cb();
        }
    });
};
