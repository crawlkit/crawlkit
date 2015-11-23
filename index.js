'use strict'; // eslint-disable-line
const driver = require('node-phantom-simple');
const phantomjs = require('phantomjs');
const async = require('async');
const d = require('debug');
const URI = require('urijs');
const poolModule = require('generic-pool');
const once = require('once');

const debug = d('crawler:debug');
const info = d('crawler:info');
const error = d('crawler:error');
const poolDebug = {};

const concurrencyKey = Symbol();
const urlKey = Symbol();
const finderKey = Symbol();
const timeoutKey = Symbol();
const runnerKey = Symbol();
const urlFilterKey = Symbol();
const phantomParamsKey = Symbol();
const phantomPageSettingsKey = Symbol();
const followRedirectsKey = Symbol();

function transformMapToObject(map) {
    const result = {};
    map.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

class CrawlKit {
    constructor(url) {
        this.url = url;
        this.defaultAbsoluteTo = 'http://';
        this[runnerKey] = new Map();
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

    set finder(fn) {
        this[finderKey] = (typeof fn === 'function') ? fn : null;
    }

    get finder() {
        return this[finderKey];
    }

    set urlFilter(fn) {
        this[urlFilterKey] = (typeof fn === 'function') ? fn : null;
    }

    get urlFilter() {
        return this[urlFilterKey];
    }

    addRunner(key, runner) {
        if (typeof runner.getCompanionFiles !== 'function' || typeof runner.getRunnable !== 'function') {
            throw new Error('Not a valid runner instance');
        }
        this[runnerKey].set(key, runner);
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

    crawl() {
        const self = this;
        const pool = poolModule.Pool({ // eslint-disable-line
            name: 'phantomjs',
            create: function createPhantom(callback) {
                driver.create({
                    path: phantomjs.path,
                    parameters: self.phantomParameters,
                }, callback);
            },
            destroy: function destroyPhantom(browser) {
                browser.exit();
            },
            max: this.concurrency,
            min: 1,
            log: (message, level) => {
                poolDebug[level] = poolDebug[level] || d(`pool:${level}`);
                poolDebug[level](message);
            },
        });

        return new Promise(function workOnPage(resolve) {
            let addUrl;
            const seen = new Map();
            const q = async.queue(function queueWorker(task, workerFinished) {
                debug('worker started on task', task);

                async.waterfall([
                    function acquireBrowserFromPool(done) {
                        pool.acquire((err, browser) => {
                            const scope = {browser};
                            if (err) {
                                return done(err, scope);
                            }
                            debug(`acquired phantom from pool for ${task.url}`);
                            done(null, scope);
                        });
                    },
                    function createPage(scope, done) {
                        scope.browser.createPage((err, page) => {
                            if (err) {
                                return done(err, scope);
                            }
                            debug(`page for ${task.url} created`);
                            scope.page = page;
                            done(null, scope);
                        });
                    },
                    function setPageSettings(scope, done) {
                        Promise.all(Object.keys(self.phantomPageSettings).map((key) => {
                            return new Promise((success, reject) => {
                                debug(`setting settings.${key}`);
                                scope.page.set(`settings.${key}`, self.phantomPageSettings[key], (settingErr) => {
                                    if (settingErr) {
                                        error(`setting settings.${key} failed`);
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
                                debug(`page for ${task.url} asks for redirect`);

                                if (mainFrame && type === 'Other' && !(new URI(task.url).equals(redirectedToUrl))) {
                                    addUrl(redirectedToUrl);
                                    done(`page for ${task.url} redirected to ${redirectedToUrl}`, scope);
                                }
                            };
                        }
                        scope.page.open(task.url, (err, status) => {
                            if (err) {
                                return done(err, scope);
                            }
                            if (status === 'fail') {
                                const message = `Failed to open ${task.url}`;
                                return done(message, scope);
                            }
                            debug(`page for ${task.url} opened`);
                            done(null, scope);
                        });
                    },
                    function findLinks(scope, cb) {
                        let timeoutHandler;
                        const done = once((err) => {
                            clearTimeout(timeoutHandler);
                            cb(err, scope);
                        });
                        if (!self.finder) {
                            return done();
                        }
                        function phantomCallback(err, urls) {
                            if (err) {
                                return done(err);
                            }
                            if (urls instanceof Array) {
                                error(`Finder returned ${urls.length} URLs`);
                                urls.forEach((url) => {
                                    try {
                                        const uri = new URI(url);
                                        const absoluteUrl = uri.absoluteTo(new URI(task.url)).toString();
                                        if (self.urlFilter && !self.urlFilter(absoluteUrl)) {
                                            return;
                                        }
                                        addUrl(absoluteUrl);
                                    } catch (e) {
                                        error(`${url} is not a valid URL`);
                                    }
                                });
                            } else {
                                error('Given finder returned non-Array value');
                            }
                            done();
                        }
                        scope.page.onCallback = phantomCallback;
                        scope.page.onError = phantomCallback;
                        timeoutHandler = setTimeout(function timeout() {
                            phantomCallback(`Finder timed out after ${self.timeout}ms.`, null);
                        }, self.timeout);
                        scope.page.evaluate(self.finder, (err) => {
                            if (err) {
                                clearTimeout(timeoutHandler);
                                return done(err);
                            }
                            debug(`finder code for ${task.url} evaluated`);
                        });
                    },
                    function pageRunners(scope, cb) {
                        const done = once((err) => {
                            cb(err, scope);
                        });

                        if (self.getRunners().size === 0) {
                            debug('No runners defined');
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
                            const runner = next.value[1];
                            Promise.all((runner.getCompanionFiles() || []).map((filename) => {
                                return new Promise((injected, reject) => {
                                    scope.page.injectJs(filename, (err) => {
                                        if (err) {
                                            error(`Failed to inject companion file '${filename}' for runner '${runnerId}'.`);
                                            return reject(err);
                                        }
                                        debug(`Injected companion file '${filename}' for runner '${runnerId}'.`);
                                        injected();
                                    });
                                });
                            })).then(function run() {
                                const phantomCallback = (err, result) => {
                                    clearTimeout(timeoutHandler);
                                    results[runnerId] = {};
                                    if (err) {
                                        results[runnerId].error = err;
                                        error(`Runner '${runnerId}' errored: ${err}`);
                                    } else {
                                        results[runnerId].result = result;
                                        debug(`Runner '${runnerId}' result: ${result}`);
                                    }
                                    nextRunner();
                                };
                                scope.page.onCallback = phantomCallback;
                                scope.page.onError = phantomCallback;
                                info(`Starting runner '${runnerId}'`);
                                timeoutHandler = setTimeout(function timeout() {
                                    phantomCallback(`Runner '${runnerId}' timed out after ${self.timeout}ms.`, null);
                                }, self.timeout);
                                scope.page.evaluate(runner.getRunnable(), (err) => {
                                    if (err) {
                                        clearTimeout(timeoutHandler);
                                        return done(err);
                                    }
                                    debug(`Runner '${runnerId}' evaluated`);
                                });
                            }, done);
                        };
                        nextRunner();
                    },
                ], (err, scope) => {
                    if (err) {
                        error(err);
                        task.result.error = err;
                    }
                    if (scope.page) {
                        scope.page.close();
                    }
                    if (scope.browser) {
                        pool.release(scope.browser);
                    }
                    workerFinished(err);
                });
            }, self.concurrency);

            q.drain = () => {
                info(`Processed ${seen.size} discovered URLs.`);
                pool.drain(function drainPool() {
                    pool.destroyAllNow();
                });
                const result = {
                    results: transformMapToObject(seen),
                };
                resolve(result);
            };

            addUrl = (u) => {
                let url = new URI(u);
                url = url.absoluteTo(self.defaultAbsoluteTo);
                url.normalize();
                url = url.toString();

                if (!seen.has(url)) {
                    info(`Discovered ${url} - adding.`);
                    const result = {};
                    seen.set(url, result);
                    q.push({
                        url,
                        result,
                    });
                } else {
                    debug(`Already seen ${url} - skipping.`);
                }
            };

            addUrl(self.url);
        });
    }
}

module.exports = CrawlKit;
