'use strict'; // eslint-disable-line

const Runnable = require('./Runnable.js');

/**
* A webpage runner blueprint
*
* @interface
*/
class Runner extends Runnable {

    /**
    * A method to get a function from that is evaluated within the web page and returns a result.
    *
    * The returned function should call back with an result of any serializable kind by calling
    * `window.callPhantom(error, result)`.
    * If your method did not provoke an error, pass null as the first argument.
    *
    * The time out of the returned function is controlled via {@link Runner#timeout}.
    *
    * The returned function will be called immediately after page load, any defined {@link Finder}
    * and other {@link Runner}s added before.
    *
    * @see [finders/genericAnchors.js]{@link
    * https://github.com/crawlkit/crawlkit/blob/master/finders/genericAnchors.js}
    * for an example of a valid returned runnable function.
    * @return {Function} A function to be evaluated within the crawled webpage
    */
    getRunnable() {
        return function emptyRunner() {
            window.callPhantom(null, undefined);
        };
    }

    /**
    * Optional. A method to do post processing on the result returned from calling the result of
    * the method returned from {@link Runner#getRunnable}.
    * Will not be called on errors.
    * This method runs in node-space.
    *
    * @param {*} result The result returned from the page runner
    * @return {Promise.<*>} A promise resolving to the post-processed result
    */
    transformResult(result) {
        // default implementation is identity
        return Promise.resolve(result);
    }

    /**
    * The (local) files returned by this method are injected into the webpage before
    * the method received from {@link Runner#getRunnable} is evaluated.
    * Any global exposed by the companion files can be accessed by the method returned
    * from {@link Runner#getRunnable}.
    *
    * @return {(Array|Promise.<Array>)} Has to either return an Array or a Promise resolving
    *                                   to an Array. Return an empty Array if your code does not
    *                                   need companion files.
    */
    getCompanionFiles() {
        return [];
    }
}

module.exports = Runner;
