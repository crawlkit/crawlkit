const genericAnchors = require('../finders/genericAnchors.js');

/**
* A link discovery class blueprint
*
* @interface
*/
class Finder {
    /**
    * A method to get a function from that is evaluated within the web page to
    * discover links to follow.
    *
    * The returned function should call back with an array of discovered URLs by calling
    * `window.callPhantom(error, urlArray)`.
    * If your method did not provoke an error, pass null as the first argument.
    * You can also throw an error from your returned function.
    * Console output from the returned function can be seen if DEBUG="*:debug" is enabled.
    *
    * The time out of the returned function is controlled via {@link CrawlKit#timeout}.
    *
    * Keep in mind that finder functions run in the webpage (and as such are restricted to browser features).
    * There are no node features available. Also, closures, etc. won't work.
    * Write this function as if it was called inside a pretty old WebKit.
    *
    * The returned function will be called immediately after page load.
    *
    * @see [finders/genericAnchors.js]{@link https://github.com/crawlkit/crawlkit/blob/master/finders/genericAnchors.js} for an example of a valid returned runnable function.
    * @return {Function} A function to be evaluated within the crawled webpage
    */
    getRunnable() {
        return genericAnchors;
    }

    /**
    * Optional. A method that allows you to filter and rewrite discovered URLs.
    * This method is run in node space and so can use all features and closures available there.
    *
    * @see [examples/advanced.js]{@link https://github.com/crawlkit/crawlkit/blob/master/examples/advanced.js} for an example.
    * @optional
    * @param {String} toBeAddedUrl The URL that is about to be added.
    * @param {String} discoveredOnUrl The origin URL where the new one that is about to be added was found.
    * @return {(boolean|String)} Return `false` to discard the URL (e.g. not add it to the queue at all).
    *                        Any other return value (as long as it is a valid URL) will be used instead.
    *                        If you return a relative URL, it will be rewritten absolute to the URL where it was found.
    *                        Invalid URLs (e.g. javascript:;, mailto:, etc.) will be ignored.
    */
    urlFilter(toBeAddedUrl, /* eslint-disable no-unused-vars*/ discoveredOnUrl) {
        return toBeAddedUrl;
    }
}

module.exports = Finder;
