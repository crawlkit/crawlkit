/**
* A webpage runner blueprint
*
* @interface
*/
class Runner {

    /**
    * A method to get a function from that is evaluated within the web page and returns a result.
    *
    * The returned function should call back with an result of any serializable kind by calling
    * `window.callPhantom(error, result)`.
    * If your method did not provoke an error, pass null as the first argument.
    * You can also throw an error from your returned function.
    * Console output from the returned function can be seen if DEBUG="*:debug" is enabled.
    *
    * The time out of the returned function is controlled via {@link CrawlKit#timeout}.
    *
    * Keep in mind that returned functions run in the webpage (and as such are restricted to browser features).
    * There are no node features available. Also, closures, etc. won't work.
    * Write this function as if it was called inside a pretty old WebKit.
    *
    * The returned function will be called immediately after page load, any defined {@link Finder} and other {@link Runner}s added before.
    *
    * @see [finders/genericAnchors.js]{@link https://github.com/crawlkit/crawlkit/blob/master/finders/genericAnchors.js} for an example of a valid returned runnable function.
    * @return {Function} A function to be evaluated within the crawled webpage
    */
    getRunnable() {
        return function emptyRunner() {
            window.callPhantom(null, undefined);
        };
    }

    /**
    * The (local) files returned by this method are injected into the webpage before
    * the method received from {@link Runner#getRunnable} is evaluated.
    * Any global exposed by the companion files can be accessed by the method returned from {@link Runner#getRunnable}.
    *
    * @return {(Array|Promise.<Array>)} Has to either return an Array or a Promise resolving to an Array. Return an empty Array if your code does not need companion files.
    */
    getCompanionFiles() {
        return [];
    }
}

module.exports = Runner;
