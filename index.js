'use strict'; // eslint-disable-line
const driver = require('node-phantom-simple');
const phantomjs = require('phantomjs');
const async = require('async');
const d = require('debug');
const URI = require('urijs');
const poolModule = require('generic-pool');

const debug = d('crawler:debug');
const info = d('crawler:info');
const error = d('crawler:error');
const debugPool = d('crawler:debug:pool');

// Attention: the following can not be written in short notation
// as it has to run within Phantom
function noneFinder() {
    return [];
}

class Crawler {
function transformMapToObject(map) {
    const result = {};
    map.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

    constructor(url, options) {
        const opts = options || {};
        this.url = url;
        this.concurrency = opts.concurrency;
        this.timeout = opts.timeout;
        this.defaultAbsoluteTo = 'http://';
    }

    set timeout(num) {
        this._timeout = parseInt(num, 10);
    }

    get timeout() {
        return Math.max(0, this._timeout || 0);
    }

    set concurrency(num) {
        this._concurrency = parseInt(num, 10);
    }

    get concurrency() {
        return Math.max(1, this._concurrency || 1);
    }

    set url(str) {
        this._url = str;
    }

    get url() {
        return this._url;
    }

    crawl(finderFn) {
        const finder = (typeof finderFn === 'function') ? finderFn : noneFinder;
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
            log: debugPool,
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
                    function findLinks(scope, done) {
                        setTimeout(function evaluate() {
                            scope.page.evaluate(finder, (err, urls) => {
                                if (err) {
                                    return done(err, scope);
                                }
                                debug(`finder code for ${task.url} evaluated`);

                                if (urls instanceof Array) {
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
                            });
                        }, self.timeout);
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

module.exports = Crawler;
