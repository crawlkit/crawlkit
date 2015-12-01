'use strict'; // eslint-disable-line
const driver = require('node-phantom-simple');
const HeadlessError = require('node-phantom-simple/headless_error');
const phantomjs = require('phantomjs');
const async = require('async');
const d = require('debug');
const urijs = require('urijs');
const poolModule = require('generic-pool');
const once = require('once');
const NanoTimer = require('nanotimer');
const Chance = require('chance');
const JSONStream = require('JSONStream');

const debug = d('crawlkit:debug');
const info = d('crawlkit:info');
const error = d('crawlkit:error');
const poolDebug = {};

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

function getFinderRunnable(crawlerInstance) {
    if (!getFinder(crawlerInstance)) {
        return null;
    }
    return getFinder(crawlerInstance).getRunnable() || null;
}

function getUrlFilter(crawlerInstance) {
    const finder = getFinder(crawlerInstance);
    return finder.urlFilter ? finder.urlFilter.bind(finder) : null;
}

function getFinderParameters(crawlerInstance) {
    return crawlerInstance[finderKey].parameters || [];
}

function getRunners(crawlerInstance) {
    return crawlerInstance[runnerKey];
}

/**
* Checks whether a given stack trace belongs to an error from a Phantom evaluation.
* This can be used to distinguish between stack traces of errors on a page opened
* with PhantomJS and evaluated code within.
*
* @private
* @param {Array.<Object>} trace The Phantom trace (for example from [page.onError]{@link http://phantomjs.org/api/webpage/handler/on-error.html})
* @return {boolean} Whether the trace belongs to a PhantomJS-based execution or not.
*/
function isPhantomError(trace) {
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
}

/**
* This applies a URL filter function to a given URL,
* based on a source URL and calls a given callback
* if the filter does not return false.
*
* @private
* @param {Function} [filterFn] The filter function to call on the URL. If not given, the URL will be assumed accepted.
* @param {String} url The URL to filter. If this URL is not valid, it will be silently discarded (callback will not be called)
* @param {String} fromUrl A URL where the URL to be filter originated from. In case the filter returns a relative URL, it will be rewritten relative to the this URL.
* @param {Function} cb A function that is called with the rewritten URL
* @param {(boolean|String)} returns the added URL if it was added. False if the URL was discarded. Throws an error if there is a problem with the URL.
*/
function applyUrlFilterFn(filterFn, url, fromUrl, cb) {
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
        const self = this;
        const crawlTimer = new NanoTimer();
        let stream;
        if (shouldStream) {
            stream = JSONStream.stringifyObject();
        }


        info(`Starting to crawl. Concurrency is %s`, self.concurrency);
        const pool = poolModule.Pool({ // eslint-disable-line
            name: 'phantomjs',
            create: (callback) => {
                async.waterfall([
                    function createPhantom(done) {
                        driver.create({
                            path: phantomjs.path,
                            parameters: self.phantomParameters,
                        }, done);
                    },
                    function addCookies(browser, done) {
                        if (self.browserCookies.length === 0) {
                            return done(null, browser);
                        }
                        Promise.all(self.browserCookies.map((cookie) => {
                          return new Promise((success, reject) => {
                              debug(`adding cookie '${cookie.name}=${cookie.value}'`);
                              browser.addCookie(cookie, (cookieErr) => {
                                  if (cookieErr) {
                                      error(`adding cookie '${cookie.name}' failed`);
                                      return reject(cookieErr);
                                  }
                                  success();
                              });
                          });
                        })).then(() => {
                            debug(`finished adding cookies`);
                            done(null, browser);
                        }, (cookieErr) => {
                            done(cookieErr, browser);
                        });
                    },
                ], callback);
            },
            destroy: (browser) => {
                browser.exit();
            },
            max: self.concurrency,
            min: 1,
            log: (message, level) => {
                poolDebug[level] = poolDebug[level] || d(`crawlkit:pool:phantomjs:${level}`);
                poolDebug[level](message);
            },
        });

        const promise = new Promise(function workOnPage(resolve) {
          if (!self.url) {
              throw new Error(`Defined url '${this.url}' is not valid.`);
          }
          const seen = new Map();
            crawlTimer.time((stopCrawlTimer) => {
                let addUrl;
                const q = async.queue(function queueWorker(task, workerFinished) {
                    task.tries++;
                    const workerLogPrefix = `crawlkit:task(${task.id})`;
                    const workerDebug = d(`${workerLogPrefix}:debug`);
                    const workerInfo = d(`${workerLogPrefix}:info`);
                    const workerError = d(`${workerLogPrefix}:error`);
                    const workerTimer = new NanoTimer();

                    info(`Worker started - ${q.length()} task(s) left in the queue.`);
                    workerInfo(`Took ${task.url} from queue` + (task.tries > 1 ? ` (attempt ${task.tries})` : '') + '.');
                    workerTimer.time((stopWorkerTimer) => {
                        async.waterfall([
                            function acquireBrowserFromPool(done) {
                                pool.acquire((err, browser) => {
                                    const scope = {browser};
                                    if (err) {
                                        return done(err, scope);
                                    }
                                    workerDebug(`Acquired phantom from pool.`);
                                    done(null, scope);
                                });
                            },
                            function createPage(scope, done) {
                                scope.browser.createPage((err, page) => {
                                    if (err) {
                                        return done(err, scope);
                                    }
                                    workerDebug(`Page created.`);
                                    scope.page = page;
                                    done(null, scope);
                                });
                            },
                            function setPageSettings(scope, done) {
                                const settingsToSet = Object.assign({}, self.phantomPageSettings);
                                if (!self.followRedirects) {
                                    // TODO: fix - enabling the next line currently stalls PhantomJS
                                    // but it is needed to prevent redirects when redirects are not
                                    // supposed to be followed

                                    // settingsToSet.navigationLocked = true;
                                }

                                Promise.all(Object.keys(settingsToSet).map((key) => {
                                    return new Promise((success, reject) => {
                                        workerDebug(`Attempting to set setting ${key} => ${JSON.stringify(settingsToSet[key])}`);
                                        scope.page.set(key, settingsToSet[key], (settingErr) => {
                                            if (settingErr) {
                                                workerError(`Setting ${key} failed`);
                                                return reject(settingErr);
                                            }
                                            workerDebug(`Successfully set setting ${key}`);
                                            success();
                                        });
                                    });
                                })).then(() => {
                                    done(null, scope);
                                }, (settingErr) => {
                                    done(settingErr, scope);
                                });
                            },
                            function openPage(scope, done) {
                                scope.page.onNavigationRequested = (redirectedToUrl, type, willNavigate, mainFrame) => {
                                    if (urijs(task.url).equals(redirectedToUrl)) {
                                        // this is the initial open of the task URL, ignore
                                        return;
                                    }

                                    workerDebug(`Page for ${task.url} asks for redirect. Will navigatate? ${willNavigate ? 'Yes' : 'No'}`);

                                    if (self.followRedirects) {
                                        if (mainFrame && type === 'Other') {
                                            try {
                                            const state = applyUrlFilterFn(self.redirectFilter, redirectedToUrl, task.url, addUrl);
                                                if (state === false) {
                                                    done(`URL ${redirectedToUrl} was not followed`, scope);
                                                } else {
                                                    done(`page for ${task.url} redirected to ${redirectedToUrl}`, scope);
                                                }
                                            } catch (e) {
                                                workerDebug(`Error on redirect filter (${redirectedToUrl}, ${task.url})`);
                                                done(e, scope);
                                            }
                                        }
                                    }
                                };

                                scope.page.open(task.url, (err, status) => {
                                    if (err) {
                                        return done(err, scope);
                                    }
                                    if (status === 'fail') {
                                        return done(`Failed to open ${task.url}`, scope);
                                    }
                                    workerDebug(`Page opened`);
                                    done(null, scope);
                                });
                            },
                            function findLinks(scope, cb) {
                                if (!getFinder(self)) {
                                    return cb(null, scope);
                                }

                                let timeoutHandler;
                                const done = once((err) => {
                                    clearTimeout(timeoutHandler);
                                    cb(err, scope);
                                });
                                function phantomCallback(err, urls) {
                                    if (err) {
                                        return done(err);
                                    }
                                    if (urls instanceof Array) {
                                        workerInfo(`Finder discovered ${urls.length} URLs.`);
                                        urls.forEach((url) => {
                                            try {
                                            const state = applyUrlFilterFn(getUrlFilter(self), url, task.url, addUrl);
                                                if (state === false) {
                                                    workerDebug(`URL ${url} ignored due to URL filter.`);
                                                } else if (url !== state) {
                                                    workerDebug(`${url} was rewritten to ${state}.`);
                                                } else {
                                                    workerDebug(`${url} was added.`);
                                                }
                                            } catch (e) {
                                                workerDebug(`Error on URL filter (${url}, ${task.url})`);
                                                workerDebug(e);
                                            }
                                        });
                                    } else {
                                        workerError('Given finder returned non-Array value');
                                    }
                                    done();
                                }
                                scope.page.onCallback = phantomCallback;
                                scope.page.onError = (err, trace) => {
                                    if (isPhantomError(trace)) {
                                        phantomCallback(err);
                                    } else {
                                        workerDebug(`Page: "${err}" in ${JSON.stringify(trace)}`);
                                    }
                                };
                                timeoutHandler = setTimeout(() => {
                                    phantomCallback(`Finder timed out after ${self.timeout}ms.`, null);
                                }, self.timeout);
                                const params = [getFinderRunnable(self)].concat(getFinderParameters(self));
                                params.push((err) => {
                                    if (err) {
                                        clearTimeout(timeoutHandler);
                                        return done(err);
                                    }
                                    workerDebug(`Finder code evaluated`);
                                });
                                scope.page.evaluate.apply(scope.page, params);
                            },
                            function pageRunners(scope, cb) {
                                const done = once((err) => {
                                    cb(err, scope);
                                });

                                if (getRunners(self).size === 0) {
                                    workerDebug('No runners defined');
                                    return done();
                                }
                                const runnerIterator = getRunners(self)[Symbol.iterator]();
                                const results = task.result.runners = {};
                                const nextRunner = () => {
                                    const next = runnerIterator.next();
                                    if (next.done) {
                                        return done();
                                    }
                                    let timeoutHandler;
                                    const runnerId = next.value[0];
                                    const runnerObj = next.value[1];
                                    const runner = runnerObj.runner;
                                    const parameters = runnerObj.parameters;

                                    Promise.resolve(runner.getCompanionFiles())
                                    .then((companionFiles) => {
                                      return Promise.all((companionFiles || []).map((filename) => {
                                          return new Promise((injected, reject) => {
                                              scope.page.injectJs(filename, (err) => {
                                                  if (err) {
                                                      workerError(`Failed to inject companion file '${filename}' for runner '${runnerId}' on ${task.url}`);
                                                      return reject(err);
                                                  }
                                                  workerDebug(`Injected companion file '${filename}' for runner '${runnerId}' on ${task.url}`);
                                                  injected();
                                              });
                                          });
                                      }));
                                    }, done)
                                    .then(function run() {
                                        const runnerLogPrefix = `${workerLogPrefix}:runner(${runnerId})`;
                                        const runnerConsole = d(`${runnerLogPrefix}:console:debug`);
                                        const runnerInfo = d(`${runnerLogPrefix}:info`);
                                        const runnerDebug = d(`${runnerLogPrefix}:debug`);
                                        const runnerError = d(`${runnerLogPrefix}:error`);

                                        const phantomCallback = (err, result) => {
                                            clearTimeout(timeoutHandler);
                                            results[runnerId] = {};
                                            if (err) {
                                                results[runnerId].error = err;
                                                runnerError(err);
                                            } else {
                                                results[runnerId].result = result;
                                                runnerInfo(`Finished.`);
                                            }
                                            nextRunner();
                                        };
                                        scope.page.onCallback = phantomCallback;
                                        scope.page.onError = (err, trace) => {
                                            if (isPhantomError(trace)) {
                                                phantomCallback(err);
                                            } else {
                                                runnerDebug(`Page: "${err}" in ${JSON.stringify(trace)}`);
                                            }
                                        };
                                        scope.page.onConsoleMessage = runnerConsole;
                                        runnerInfo(`Started.`);
                                        timeoutHandler = setTimeout(() => {
                                            phantomCallback(`Runner '${runnerId}' timed out after ${self.timeout}ms.`, null);
                                        }, self.timeout);
                                        const params = [runner.getRunnable()].concat(parameters);
                                        params.push((err) => {
                                            if (err) {
                                                clearTimeout(timeoutHandler);
                                                return done(err);
                                            }
                                            workerDebug(`Runner '${runnerId}' evaluated`);
                                        });
                                        scope.page.evaluate.apply(scope.page, params);
                                    }, done)
                                    .catch((err) => {
                                        clearTimeout(timeoutHandler);
                                        done(err);
                                    });
                                };
                                nextRunner();
                            },
                        ], (err, scope) => {
                            if (err) {
                                workerError(err);
                                task.result.error = err;
                            }
                            if (shouldStream) {
                                stream.write([task.url, task.result]);
                            }

                            if (scope.page) {
                                workerDebug(`Page closed.`);
                                scope.page.close();
                            }
                            if (scope.browser) {
                                if (err && (err instanceof HeadlessError)) {
                                    // take no chances - if there was an error on Phantom side, we should get rid of the instance
                                    workerInfo(`Phantom instance destroyed.`);
                                    pool.destroy(scope.browser);
                                    scope.browser = null;
                                } else {
                                    workerDebug(`Phantom released to pool.`);
                                    pool.release(scope.browser);
                                }
                            }
                            if (err instanceof HeadlessError && task.tries < self.retries) {
                                info(`Retrying ${task.url} - adding back to queue`);
                                delete task.result.error;
                                q.unshift(task);
                            }
                            stopWorkerTimer();
                            workerFinished(err);
                        });
                    }, '', 'm', (workerRuntime) => {
                        workerInfo('Finished. Took %sms.', workerRuntime);
                    });
                }, self.concurrency);

                q.drain = () => {
                    stopCrawlTimer();
                    pool.drain(function drainPool() {
                        pool.destroyAllNow();
                    });
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
                        info(`Adding ${url}`);
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
                        debug(`Skipping ${url} - already seen.`);
                    }
                };

                addUrl(self.url);
            }, '', 's', (time) => {
              info(`Finished. Processed ${seen.size} discovered URLs. Took ${time}s.`);
            });
        });
        if (shouldStream) {
            promise.catch((err) => {
                error(err);
                throw err;
            });
            return stream;
        }
        return promise;
    }
}

module.exports = CrawlKit;
