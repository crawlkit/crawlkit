'use strict'; // eslint-disable-line

const urijs = require('urijs');

/**
* This applies a URL filter function to a given URL,
* based on a source URL and calls a given callback
* if the filter does not return false.
*
* @private
* @param {Function} [filterFn]  The filter function to call on the URL.
*                               If not given, the URL will be assumed accepted.
* @param {String} url           The URL to filter. If this URL is not valid,
*                               it will be silently discarded (callback will not be called)
* @param {String} fromUrl       A URL where the URL to be filter originated from.
*                               In case the filter returns a relative URL,
*                               it will be rewritten relative to the this URL.
* @param {Function} cb          A function that is called with the rewritten URL
* @return {(boolean|String)}    returns the added URL if it was added.
*                               False if the URL was discarded.
*                               Throws an error if there is a problem with the URL.
*/
module.exports = (filterFn, url, fromUrl, cb) => {
    const uri = urijs(url);
    const fromUri = urijs(fromUrl);
    fromUri.normalize();
    let absoluteUrl = uri.absoluteTo(fromUri).toString();
    if (typeof filterFn === 'function') {
        const rewrittenUrl = filterFn(absoluteUrl, fromUri.toString());
        if (rewrittenUrl === false) {
            return false;
        }
        if (rewrittenUrl !== absoluteUrl) {
            absoluteUrl = urijs(rewrittenUrl).absoluteTo(fromUri).toString();
        }
    }
    cb(absoluteUrl);
    return absoluteUrl;
};
