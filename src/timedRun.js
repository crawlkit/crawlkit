'use strict'; // eslint-disable-line

const NanoTimer = require('nanotimer');
const juration = require('juration');

/**
* Runs a function and times it
*
* @private
* @param {!Object} logger A {@link logger} object
* @param {!Function} runFn The function to run
*/
module.exports = (logger, runFn) => {
    new NanoTimer().time(runFn, '', 's', (time) => {
        logger.info(`Finished. Took ${juration.stringify(time) || 'less than a second'}.`);
    });
};
