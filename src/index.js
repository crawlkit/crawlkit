'use strict'; // eslint-disable-line

const HeadlessError = require('node-phantom-simple/headless_error');

const async = require('async');
const debug = require('debug');
const urijs = require('urijs');

const NanoTimer = require('nanotimer');
const Chance = require('chance');
const JSONStream = require('JSONStream');
const createPhantomPool = require('./createPhantomPool.js');

const step = {
    acquireBrowser: require('./worker/steps/acquireBrowser.js'),
    setPageSettings: require('./worker/steps/setPageSettings.js'),
    createPage: require('./worker/steps/createPage.js'),
    openPage: require('./worker/steps/openPage.js'),
    findLinks: require('./worker/steps/findLinks.js'),
    pageRunners: require('./worker/steps/pageRunners.js'),
};

const logger = {
    debug: debug('crawlkit:debug'),
    info: debug('crawlkit:info'),
    error: debug('crawlkit:error'),
};

const concurrencyKey = Symbol();
const urlKey = Symbol();
const finderKey = Symbol();
const timeoutKey = Symbol();
const runnerKey = Symbol();
const phantomParamsKey = Symbol();
const phantomPageSettingsKey = Symbol();
const followRedirectsKey = Symbol();
const browserCookiesKey = Symbol();
const retriesKey = Symbol();
const redirectFilterKey = Symbol();

/**
* Transforms a {Map} to an {Object} hash.
*
* @private
* @param {Map} map The map to transform
* @return {Object} The transformed key/value hash object.
*/
function transformMapToObject(map) {
    const result = {};
    map.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

/**
* Gets a finder definition of a {@link CrawlKit} instance.
* @private
* @return {Finder} the finder instance set via {@link CrawlKit#setFinder}.
*/
function getFinder(crawlerInstance) {
    return crawlerInstance[finderKey].finder;
}

function getFinderParameters(crawlerInstance) {
    return crawlerInstance[finderKey].parameters;
}

function getRunners(crawlerInstance) {
    return crawlerInstance[runnerKey];
}

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
    * @return {CrawlKit} a new CrawlKit instance
    */
    constructor(url) {
        if (url) {
            this.url = url;
        }
        this[runnerKey] = new Map();
        this[finderKey] = {};
        this[browserCookiesKey] = [];
    }

    /**
    * Getter/setter for the timeout in ms for runners and finder functions.
    * The timeout starts fresh for each runner.
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
        return Math.max(0, this[timeoutKey] || 10000);
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
    * Getter/setter for the number of retries when a PhantomJS instance crashes on a page.
    * When a PhantomJS instance crashes whilst crawling a webpage, this instance is shutdown
    * and replaced by a new one. By default the webpage that failed in such a way will be
    * re-queued. This member controls how often that re-queueing happens.
    *
    * Values under zero are set to zero.
    *
    * @type {!integer}
    * @default 3 (try 2 more times after the first failure)
    */
    set retries(n) {
        this[retriesKey] = parseInt(n, 10);
    }

    /**
    * @ignore
    */
    get retries() {
        return Math.max(0, this[retriesKey] || 3);
    }

    /**
    * Allows you to add a runner that is executed on each crawled page.
    * The returned value of the runner is added to the overall result.
    * Runners run sequentially on each webpage in the order they were added.
    * If a runner is crashing PhantomJS more than {@link CrawlKit#retries} times, subsequent {@link Runner}s are not executed.
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
        const crawlTimer = new NanoTimer();
        let stream;
        if (shouldStream) {
            stream = JSONStream.stringifyObject();
        }

        logger.info(`Starting to crawl. Concurrent PhantomJS browsers: ${this.concurrency}.`);
        const pool = createPhantomPool(logger, this.concurrency, this.phantomParameters, this.browserCookies);

        const promise = new Promise((resolve) => {
            if (!this.url) {
                throw new Error(`Defined url '${this.url}' is not valid.`);
            }
            const seen = new Map();
            crawlTimer.time((stopCrawlTimer) => {
                let addUrl;
                const q = async.queue((scope, workerFinished) => {
                    scope.tries++;
                    const workerLogPrefix = `crawlkit:task(${scope.id})`;
                    const workerLogger = {
                        debug: debug(`${workerLogPrefix}:debug`),
                        info: debug(`${workerLogPrefix}:info`),
                        error: debug(`${workerLogPrefix}:error`),
                    };
                    const workerTimer = new NanoTimer();

                    logger.info(`Worker started - ${q.length()} task(s) left in the queue.`);
                    workerLogger.info(`Took ${scope.url} from queue` + (scope.tries > 1 ? ` (attempt ${scope.tries})` : '') + '.');
                    workerTimer.time((stopWorkerTimer) => {
                        async.waterfall([
                            step.acquireBrowser(scope, workerLogger, pool),
                            step.createPage(scope, workerLogger),
                            step.setPageSettings(scope, workerLogger, this.phantomPageSettings, this.followRedirects),
                            step.openPage(scope, workerLogger, addUrl, this.followRedirects, this.redirectFilter),
                            step.findLinks(scope, workerLogger, getFinder(this), getFinderParameters(this), addUrl, this.timeout),
                            step.pageRunners(scope, workerLogger, getRunners(this), workerLogPrefix, this.timeout),
                        ], (err) => {
                            if (err) {
                                workerLogger.error(err);
                                scope.result.error = err;
                            }

                            if (scope.page) {
                                workerLogger.debug(`Page closed.`);
                                scope.page.close();
                            }
                            if (scope.browser) {
                                if (err instanceof HeadlessError) {
                                    // take no chances - if there was an error on Phantom side, we should get rid of the instance
                                    workerLogger.info(`Notifying pool to destroy Phantom instance.`);
                                    pool.destroy(scope.browser);
                                    scope.browser = null;
                                } else {
                                    workerLogger.debug(`Phantom released to pool.`);
                                    pool.release(scope.browser);
                                }
                            }
                            stopWorkerTimer();
                            if (err instanceof HeadlessError && scope.tries < this.retries) {
                                logger.info(`Retrying ${scope.url} - adding back to queue`);
                                delete scope.result.error;
                                q.unshift(scope);
                                return workerFinished();
                            }
                            if (shouldStream) {
                                stream.write([scope.url, scope.result]);
                            }
                            workerFinished(err);
                        });
                    }, '', 'm', (workerRuntime) => {
                        workerLogger.info('Finished. Took %sms.', workerRuntime);
                    });
                }, this.concurrency);

                q.drain = () => {
                    logger.debug('Queue empty. Stopping crawler timer');

                    stopCrawlTimer();
                    logger.debug('Draining pool');
                    pool.drain(() => pool.destroyAllNow());

                    if (shouldStream) {
                        stream.end();
                        resolve();
                    } else {
                        const result = {
                            results: transformMapToObject(seen),
                        };
                        resolve(result);
                    }
                };

                addUrl = (u) => {
                    let url = urijs(u);
                    url = url.absoluteTo(defaultAbsoluteTo);
                    url.normalize();
                    url = url.toString();

                    if (!seen.has(url)) {
                        logger.info(`Adding ${url}`);
                        const result = {};
                        // don't keep result in memory if we stream
                        seen.set(url, shouldStream ? null : result);
                        q.push({
                            tries: 0,
                            url,
                            result,
                            id: new Chance().name(),
                        });
                    } else {
                        logger.debug(`Skipping ${url} - already seen.`);
                    }
                };

                addUrl(this.url);
            }, '', 's', (time) => {
                logger.info(`Finished. Processed ${seen.size} discovered URLs. Took ${time}s.`);
            });
        });
        if (shouldStream) {
            promise.catch((err) => {
                logger.error(err);
                throw err;
            });
            return stream;
        }
        return promise;
    }
}

module.exports = CrawlKit;
