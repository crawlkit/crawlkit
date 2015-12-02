'use strict'; // eslint-disable-line

const urijs = require('urijs');

/**
* Checks whether a given stack trace belongs to an error from a Phantom evaluation.
* This can be used to distinguish between stack traces of errors on a page opened
* with PhantomJS and evaluated code within.
*
* @private
* @param {Array.<Object>} trace The Phantom trace (for example from [page.onError]{@link http://phantomjs.org/api/webpage/handler/on-error.html})
* @return {boolean} Whether the trace belongs to a PhantomJS-based execution or not.
*/
module.exports = (trace) => {
    if (!(trace instanceof Array)) {
        return false;
    }
    for (let i = 0; i < trace.length; i++) {
        const obj = trace[i];
        try {
            if (urijs(obj.file).protocol() === 'phantomjs') {
                return true;
            }
        } catch (e) {
            continue;
        }
    }
    return false;
};
