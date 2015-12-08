'use strict'; // eslint-disable-line

/**
* @private
*/
const timeoutKey = Symbol();

/**
* The default timeout for a runnable in ms.
* @type {!integer}
* @default 10000
*/
const DEFAULT_TIMEOUT = 10000;

/**
* A webpage runnable blueprint
*
* @interface
*/
class Runnable {

    /**
    * A method to get a function from that is evaluated inm various ways.
    *
    * The returned function should call back with an result of any serializable kind by calling
    * `window.callPhantom(error, result)`.
    * If your method did not provoke an error, pass null as the first argument.
    * You can also throw an error from your returned function.
    * Console output from the returned function can be seen if DEBUG="*:debug" is enabled.
    *
    * The time out of the returned function is controlled via {@link Runnable#timeout}.
    *
    * Keep in mind that returned functions run in the webpage (and as such are restricted to browser features).
    * There are no node features available. Also, closures, etc. won't work.
    * Write this function as if it was called inside a pretty old WebKit.
    *
    * The returned function will be called immediately after page load.
    *
    * @return {Function} A function to be evaluated within the crawled webpage
    */
    getRunnable() {
        return function noopFunction() {
            window.callPhantom(null, undefined);
        };
    }

    /**
    * Optional. Getter/setter for the timeout of the method returned by {@link Runnable#getRunnable}.
    *
    * Values under zero are set to zero.
    *
    * @type {!integer}
    * @default 10000 (10 seconds)
    */
    set timeout(num) {
        this[timeoutKey] = parseInt(num, 10);
    }

    /**
    * @ignore
    */
    get timeout() {
        return Math.max(0, this[timeoutKey] || DEFAULT_TIMEOUT);
    }
}

Runnable.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

module.exports = Runnable;
