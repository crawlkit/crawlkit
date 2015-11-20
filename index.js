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
            const q = async.queue(function queueWorker(task, callback) {
                debug('worker started on task', task);
                pool.acquire(function acquireBrowserFromPool(poolError, browser) {
                    function done(err) {
                        if (err) {
                            error(err);
                            task.result.error = err;
                        }
                        pool.release(browser);
                        callback(err);
                    }

                    debug(`acquired phantom from pool for ${task.url}`);
                    if (poolError) {
                        done(poolError);
                        return;
                    }

                    browser.createPage(function pageCreated(pageCreatedError, page) {
                        debug(`page for ${task.url} created`);
                        if (pageCreatedError) {
                            done(pageCreatedError);
                            return;
                        }
                        page.open(task.url, function pageOpened(pageOpenedError, status) {
                            debug(`page for ${task.url} opened`);
                            if (pageOpenedError) {
                                done(pageOpenedError);
                                return;
                            }


                            if (status === 'fail') {
                                const message = `Failed to open ${task.url}`;
                                done(message);
                                return;
                            }
                            debug(`Opened ${task.url}`);

                            function evaluate() {
                                return page.evaluate(finder, function evaluatePage(evaluatePageError, urls) {
                                    debug(`finder code for ${task.url} evaluated`);
                                    if (evaluatePageError) {
                                        page.close();
                                        done(evaluatePageError);
                                        return;
                                    }
                                    if (urls instanceof Array) {
                                        urls.forEach(function addUrlToQueue(url) {
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

                                    page.close();
                                    done();
                                });
                            }
                            if (self.timeout) {
                                setTimeout(evaluate, self.timeout);
                            } else {
                                evaluate();
                            }
                        });
                    });
                });
            }, self.concurrency);

            function transformMapToObject(map) {
                const result = {
                    results: {},
                };
                map.forEach((value, key) => {
                    result.results[key] = value;
                });
                return result;
            }

            q.drain = () => {
                info(`Processed ${seen.size} discovered URLs.`);
                pool.drain(function drainPool() {
                    pool.destroyAllNow();
                });
                resolve(transformMapToObject(seen));
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
