'use strict'; // eslint-disable-line

const urijs = require('urijs');

/**
 * Checks whether a given stack trace belongs to an error from a Phantom evaluation.
 * This can be used to distinguish between stack traces of errors on a page opened
 * with PhantomJS and evaluated code within.
 *
 * @private
 * @param {Array.<Object>} trace The Phantom trace.
 *                               For example from [page.onError]{@link
 *                               http://phantomjs.org/api/webpage/handler/on-error.html})
 * @return {boolean} Whether the trace belongs to a PhantomJS-based execution or not.
 */
module.exports = (trace) => {
  if (!(trace instanceof Array)) {
    return false;
  }
  for (let i = 0; i < trace.length; i += 1) {
    const obj = trace[i];
    try {
      if (
          obj.file === 'undefined' // hotfix for PhantomJS 2.x - see: ariya/phantomjs#13955
          || urijs(obj.file).protocol() === 'phantomjs') {
        return true;
      }
    } catch (e) {
      // we don't care, we just carry on
    }
  }
  return false;
};
