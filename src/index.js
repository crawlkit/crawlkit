'use strict'; // eslint-disable-line

const async = require('async');
const urijs = require('urijs');
const Chance = require('chance');
const JSONStream = require('JSONStream');
const HeadlessError = require('node-phantom-simple/headless_error');
const TimeoutError = require('callback-timeout/errors').TimeoutError;

const createPhantomPool = require('./createPhantomPool.js');
const cloneScope = require('./cloneScope');
const mapToObject = require('./mapToObject');
const timedRun = require('./timedRun');
const worker = require('./worker');

const concurrencyKey = Symbol();
const urlKey = Symbol();
const finderKey = Symbol();
const timeoutKey = Symbol();
const runnerKey = Symbol();
const phantomParamsKey = Symbol();
const phantomPageSettingsKey = Symbol();
const followRedirectsKey = Symbol();
const browserCookiesKey = Symbol();
const triesKey = Symbol();
const redirectFilterKey = Symbol();

/**
 * The protocol a URL without a protocol is written to.
 *
 * @private
 * @type {String}
 */
const defaultAbsoluteTo = 'http://';

/**
 * The CrawlKit base class. This is where the magic happens.
 */
class CrawlKit {

    /**
     * Create a CrawlKit instance
     * @constructor
     * @param {String} [url] The start URL. Sets the {@link CrawlKit#url}.
     * @param {String} [name] The instance name of the crawler. Used for logging purposes.
     * @return {CrawlKit} a new CrawlKit instance
     */
    constructor(url, name) {
        if (url) {
            this.url = url;
        }
        if (name) {
            this.name = name;
        }
        this[runnerKey] = new Map();
        this[finderKey] = {};
        this[browserCookiesKey] = [];
    }

    /**
     * Getter/setter for overall timeout for one website processing (opening page, evaluating runners and finder functions).
     * The timeout starts fresh for each website.
     *
     * Values under zero are set to zero.
     *
     * @type {!integer}
     * @default 30000 (30 seconds)
     */
    set timeout(num) {
        this[timeoutKey] = parseInt(num, 10);
    }

    /**
     * @ignore
     */
    get timeout() {
        return Math.max(0, this[timeoutKey] || 30000);
    }

    /**
     * Getter/setter for the concurrency of the crawler.
     * This controls the amount of PhantomJS instances that will be spawned
     * and used to work on found websites. Adapt this to the power of your machine.
     *
     * Values under one are set to one.
     *
     * @type {!integer}
     * @default 1 (No concurrency)
     */
    set concurrency(num) {
        this[concurrencyKey] = parseInt(num, 10);
    }

    /**
     * @ignore
     */
    get concurrency() {
        return Math.max(1, this[concurrencyKey] || 1);
    }

    /**
     * Getter/setter for the start URL of the crawler.
     * This is the URL that will be used as an initial endpoint for the crawler.
     * If the protocol is omitted (e.g. URL starts with //), the URL will be rewritten to http://
     * @type {String}
     */
    set url(str) {
        this[urlKey] = str;
    }

    /**
     * @ignore
     */
    get url() {
        return this[urlKey];
    }

    /**
     * With this method a {@link Finder} instance can be set for the crawler.
     * A finder is used for link discovery on a website. It is run directly after page load
     * and is optional (e.g. if you want to only work on a single page).
     *
     * @param {!Finder} finder The finder instance to use for discovery.
     * @param {...*} [runnableParams] These parameters are passed to the function returned by {@link Finder#getRunnable} at evaluation time.
     */
    setFinder(finder /* parameters... */) {
        if (!finder || typeof finder.getRunnable !== 'function') {
            throw new Error('Not a valid finder instance');
        }

        this[finderKey].finder = finder;
        this[finderKey].parameters = Array.prototype.slice.call(arguments, 1);
    }

    /**
     * Getter/setter for the number of tries when a PhantomJS instance crashes on a page
     * or {@link CrawlKit#timeout} is hit.
     * When a PhantomJS instance crashes whilst crawling a webpage, this instance is shutdown
     * and replaced by a new one. By default the webpage that failed in such a way will be
     * re-queued.
     * If the finders and runners did not respond within the defined timeout,
     * it will be tried to run them again as well.
     * This member controls how often that re-queueing happens.
     *
     * Values under zero are set to zero.
     *
     * @type {!integer}
     * @default 3 (read: try two more times after the first failure, three times in total)
     */
    set tries(n) {
        this[triesKey] = parseInt(n, 10);
    }

    /**
     * @ignore
     */
    get tries() {
        return Math.max(0, this[triesKey] || 3);
    }

    /**
     * Allows you to add a runner that is executed on each crawled page.
     * The returned value of the runner is added to the overall result.
     * Runners run sequentially on each webpage in the order they were added.
     * If a runner is crashing PhantomJS more than {@link CrawlKit#tries} times, subsequent {@link Runner}s are not executed.
     *
     * @see For an example see `examples/simple.js`. For an example using parameters, see `examples/advanced.js`.
     * @param {!String} key The runner identificator. This is also used in the result stream/object.
     * @param {!Runner} runner The runner instance to use for discovery.
     * @param {...*} [runnableParams] These parameters are passed to the function returned by {@link Runner#getRunnable} at evaluation time.
     */
    addRunner(key, runner /* args ... */) {
        if (!key) {
            throw new Error('Not a valid runner key');
        }
        if (!runner || typeof runner.getCompanionFiles !== 'function' || typeof runner.getRunnable !== 'function') {
            throw new Error('Not a valid runner instance');
        }

        const parameters = Array.prototype.slice.call(arguments, 2);

        this[runnerKey].set(key, {
            runner,
            parameters,
        });
    }

    /**
     * Getter/setter for the map of parameters to pass to PhantomJS.
     * You can use this for example to ignore SSL errors.
     * For a list of parameters, please refer to the [PhantomJS documentation]{@link http://phantomjs.org/api/command-line.html}.
     *
     * @type {!Object.<String,String>}
     */
    set phantomParameters(params) {
        this[phantomParamsKey] = params;
    }

    /**
     * @ignore
     */
    get phantomParameters() {
        return this[phantomParamsKey] || {};
    }

    /**
     * Getter/setter for the map of settings to pass to an opened page.
     * You can use this for example for Basic Authentication.
     * For a list of options, please refer to the [PhantomJS documentation]{@link http://phantomjs.org/api/webpage/property/settings.html}.
     * Nested settings can just be provided in dot notation as the key, e.g. 'settings.userAgent'.
     *
     * @type {!Object.<String,*>}
     */
    set phantomPageSettings(settings) {
        this[phantomPageSettingsKey] = settings;
    }

    /**
     * @ignore
     */
    get phantomPageSettings() {
        return this[phantomPageSettingsKey] || {};
    }

    /**
     * Getter/setter for whether to follow redirects or not.
     * When following redirects, the original page is not processed.
     *
     * @type {!boolean}
     * @default false
     */
    set followRedirects(value) {
        this[followRedirectsKey] = !!value;
    }

    /**
     * @ignore
     */
    get followRedirects() {
        return this[followRedirectsKey] || false;
    }

    /**
     * Getter/setter for the cookies to set within PhantomJS.
     * Each entry is supposed to be an object [following the PhantomJS spec]{@link http://phantomjs.org/api/webpage/method/add-cookie.html}.
     *
     * @type {!Array.<Object>}
     */
    set browserCookies(cookies) {
        if (!(cookies instanceof Array)) {
            throw new Error('Not properly munchable');
        }
        this[browserCookiesKey] = cookies;
    }

    /**
     * @ignore
     */
    get browserCookies() {
        return this[browserCookiesKey];
    }

    /**
     * Getter/setter for the filter that is applied to redirected URLs.
     * With this filter you can prevent the redirect or rewrite it.
     * The filter callback gets two arguments. The first one is the target URL
     * the scond one the source URL.
     * Return false for preventing the redirect. Return a String (URL) to follow the redirect.
     *
     * @type {Function}
     */
    set redirectFilter(filter) {
        if (typeof filter !== 'function') {
            throw new Error('Filter must be valid function');
        }
        this[redirectFilterKey] = filter;
    }

    /**
     * @ignore
     */
    get redirectFilter() {
        return this[redirectFilterKey] || ((targetUrl) => targetUrl);
    }

    /**
     * This method starts the crawling/scraping process.
     *
     * @param {boolean} [shouldStream=false] Whether to stream the results or use a Promise
     * @return {(Stream|Promise.<Object>)} By default a Promise object is returned that resolves to the result. If streaming is enabled it returns a JSON stream of the results.
     */
    crawl(shouldStream) {
        const stream = shouldStream ? JSONStream.stringifyObject() : null;
        const prefix = 'crawlkit' + (this.name ? `:${this.name}` : '');
        const logger = require('./logger')(prefix);
        const seen = new Map();

        logger.info(`Starting to crawl. Concurrent PhantomJS browsers: ${this.concurrency}.`);
        const pool = createPhantomPool(logger, this.concurrency, this.phantomParameters, this.browserCookies, prefix);

        const writeResult = (scope) => {
            if (stream) {
                stream.write([scope.url, scope.result]);
            } else {
                seen.set(scope.url, scope.result);
            }
        };

        const work = timedRun(logger, (done) => {
            if (!this.url) {
                throw new Error(`Defined url '${this.url}' is not valid.`);
            }

            let q;
            const addUrl = (u) => {
                let url = urijs(u);
                url = url.absoluteTo(defaultAbsoluteTo);
                url.normalize();
                url = url.toString();

                if (!seen.has(url)) {
                    logger.info(`Adding ${url}`);
                    seen.set(url, null);
                    q.push({
                        tries: 0,
                        stop: false,
                        url,
                        result: {},
                        id: new Chance().name(),
                    });
                    logger.info(`${q.length()} task(s) in the queue.`);
                } else {
                    logger.debug(`Skipping ${url} - already seen.`);
                }
            };

            const processResult = (scope, err) => {
                if (err instanceof HeadlessError || err instanceof TimeoutError) {
                    if (scope.tries < this.tries) {
                        logger.info(`Retrying ${scope.url} - adding back to queue.`);
                        q.unshift(cloneScope(scope));
                        return;
                    }
                    logger.info(`Tried to crawl ${scope.url} ${scope.tries} times. Giving up.`);
                }
                writeResult(scope);
            };

            q = async.queue(
                worker(this, runnerKey, finderKey, prefix, pool, addUrl, processResult),
                this.concurrency
            );

            q.drain = () => {
                logger.debug(`Processed ${seen.size} discovered URLs.`);

                setImmediate(() => {
                    logger.debug('Draining pool.');
                    pool.drain(() => pool.destroyAllNow());
                });
                done();
            };

            addUrl(this.url);
        });

        if (stream) {
            work(() => stream.end());
            return stream;
        }
        return new Promise((resolve) => {
            work(() => resolve({ results: mapToObject(seen) }));
        });
    }
}

module.exports = CrawlKit;
