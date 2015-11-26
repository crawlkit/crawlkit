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

function transformMapToObject(map) {
    const result = {};
    map.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

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
    return getFinder(crawlerInstance).urlFilter || null;
}

function getFinderParameters(crawlerInstance) {
    return crawlerInstance[finderKey].parameters || [];
}

class CrawlKit {
    constructor(url) {
        this.url = url;
        this.defaultAbsoluteTo = 'http://';
        this[runnerKey] = new Map();
        this[finderKey] = {};
    }

    set timeout(num) {
        this[timeoutKey] = parseInt(num, 10);
    }

    get timeout() {
        return Math.max(0, this[timeoutKey] || 10000);
    }

    set concurrency(num) {
        this[concurrencyKey] = parseInt(num, 10);
    }

    get concurrency() {
        return Math.max(1, this[concurrencyKey] || 1);
    }

    set url(str) {
        this[urlKey] = str;
    }

    get url() {
        return this[urlKey];
    }

    setFinder(finder /* parameters... */) {
        if (!finder || typeof finder.getRunnable !== 'function') {
            throw new Error('Not a valid finder instance');
        }

        this[finderKey].finder = finder;
        this[finderKey].parameters = Array.prototype.slice.call(arguments, 1);
    }

    set retries(n) {
        this[retriesKey] = parseInt(n, 10);
    }

    get retries() {
        return Math.max(0, this[retriesKey] || 3);
    }

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

    getRunners() {
        return this[runnerKey];
    }

    set phantomParameters(params) {
        this[phantomParamsKey] = params;
    }

    get phantomParameters() {
        return this[phantomParamsKey] || {};
    }

    set phantomPageSettings(settings) {
        this[phantomPageSettingsKey] = settings;
    }

    get phantomPageSettings() {
        return this[phantomPageSettingsKey] || {};
    }

    set followRedirects(value) {
      this[followRedirectsKey] = !!value;
    }

    get followRedirects() {
      return this[followRedirectsKey] || false;
    }

    set browserCookies(cookies) {
      if (!(cookies instanceof Array)) {
          throw new Error('Not properly munchable');
      }
      this[browserCookiesKey] = cookies;
    }

    get browserCookies() {
      return this[browserCookiesKey] || [];
    }

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
                                Promise.all(Object.keys(self.phantomPageSettings).map((key) => {
                                    return new Promise((success, reject) => {
                                        workerDebug(`Setting settings.${key}`);
                                        scope.page.set(`settings.${key}`, self.phantomPageSettings[key], (settingErr) => {
                                            if (settingErr) {
                                                workerError(`Setting settings.${key} failed`);
                                                return reject(settingErr);
                                            }
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
                                if (self.followRedirects) {
                                    scope.page.onNavigationRequested = (redirectedToUrl, type, willNavigate, mainFrame) => {
                                        workerDebug(`Page for ${task.url} asks for redirect`);

                                        if (mainFrame && type === 'Other' && !urijs(task.url).equals(redirectedToUrl)) {
                                            addUrl(redirectedToUrl);
                                            const err = `page for ${task.url} redirected to ${redirectedToUrl}`;
                                            done(err, scope);
                                        }
                                    };
                                }
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
                                                const uri = urijs(url);
                                                const fromUri = urijs(task.url);
                                                let absoluteUrl = uri.absoluteTo(fromUri).toString();
                                                if (typeof getUrlFilter(self) === 'function') {
                                                    const rewrittenUrl = getUrlFilter(self)(absoluteUrl, task.url);
                                                    if (rewrittenUrl === false) {
                                                        workerDebug(`Discovered URL ${url} ignored due to URL filter.`);
                                                        return;
                                                    }
                                                    if (rewrittenUrl !== absoluteUrl) {
                                                        workerDebug(`${url} was rewritten to ${rewrittenUrl}.`);
                                                        absoluteUrl = urijs(rewrittenUrl).absoluteTo(fromUri).toString();
                                                    }
                                                }
                                                addUrl(absoluteUrl);
                                            } catch (e) {
                                                workerDebug(e);
                                            }
                                        });
                                    } else {
                                        workerError('Given finder returned non-Array value');
                                    }
                                    done();
                                }
                                scope.page.onCallback = phantomCallback;
                                scope.page.onError = phantomCallback;
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

                                if (self.getRunners().size === 0) {
                                    workerDebug('No runners defined');
                                    return done();
                                }
                                const runnerIterator = self.getRunners()[Symbol.iterator]();
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
                                        scope.page.onError = phantomCallback;
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
                            workerFinished(err);
                            stopWorkerTimer();
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
                    url = url.absoluteTo(self.defaultAbsoluteTo);
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
        return shouldStream ? stream : promise;
    }
}

module.exports = CrawlKit;
