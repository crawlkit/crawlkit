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

function transformMapToObject(map) {
    const result = {};
    map.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

class CrawlKit {
    constructor(url, options) {
        const opts = options || {};
        this.url = url;
        this.concurrency = opts.concurrency;
        this.timeout = opts.timeout;
        this.defaultAbsoluteTo = 'http://';
    }

    set timeout(num) {
        this[timeoutKey] = parseInt(num, 10);
    }

    get timeout() {
        return Math.max(0, this[timeoutKey] || 0);
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

    crawl(runnerMap) {
        const runners = (typeof runnerMap === 'object') ? runnerMap : {};
        const self = this;
        const pool = poolModule.Pool({ // eslint-disable-line
            name: 'phantomjs',
            create: function createPhantom(callback) {
                driver.create({
                    path: phantomjs.path,
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
                    function openPage(scope, done) {
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
                        const done = once(cb);
                        if (!(typeof self.finder === 'function')) {
                            return done(null, scope);
                        }

                        setTimeout(function evaluate() {
                            scope.page.onCallback = function phantomCallback(err, urls) {
                                if (err) {
                                    return done(err, scope);
                                }
                                if (urls instanceof Array) {
                                    error(`Finder returned ${urls.length} URLs`);
                                    urls.forEach((url) => {
                                        try {
                                            const uri = new URI(url);
                                            addUrl(uri.absoluteTo(new URI(task.url)));
                                        } catch (e) {
                                            error(`${url} is not a valid URL`);
                                        }
                                    });
                                } else {
                                    error('Given finder returned non-Array value');
                                }
                                done(null, scope);
                            };
                            scope.page.evaluate(self.finder, (err) => {
                                if (err) {
                                    return done(err, scope);
                                }
                                debug(`finder code for ${task.url} evaluated`);
                            });
                        }, self.timeout);
                    },
                    function run(scope, done) {
                        const runnerIds = Object.keys(runners);
                        if (runnerIds.length) {
                            const results = task.result.runners = {};
                            const nextRunner = () => {
                                const runnerId = runnerIds.shift();
                                scope.page.onCallback = function phantomCallback(err, result) {
                                    results[runnerId] = {};
                                    if (err) {
                                        results[runnerId].error = err;
                                        error(`Runner '${runnerId}' errored: ${err}`);
                                    } else {
                                        results[runnerId].result = result;
                                        debug(`Runner '${runnerId}' result: ${result}`);
                                    }
                                    if (Object.keys(results).length === Object.keys(runners).length) {
                                        return done(null, scope);
                                    }
                                    if (runnerIds.length) {
                                        nextRunner();
                                    }
                                };
                                info(`Starting runner '${runnerId}'`);
                                scope.page.evaluate(runners[runnerId]);
                            };
                            nextRunner();
                        } else {
                            debug('No runners given');
                            done(null, scope);
                        }
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
