'use strict'; // eslint-disable-line

const async = require('async');
const urijs = require('urijs');
const Chance = require('chance');
const HeadlessError = require('node-phantom-simple/headless_error');
const TimeoutError = require('callback-timeout/errors').TimeoutError;

const cloneScope = require('./cloneScope');
const worker = require('./worker');
const createPhantomPool = require('./createPhantomPool.js');
const timedRun = require('./timedRun');

/**
 * The protocol a URL without a protocol is written to.
 *
 * @private
 * @type {String}
 */
const defaultAbsoluteTo = 'http://';

module.exports = (crawlerInstance, writeResult, runnerKey, finderKey) => {
    const prefix = 'crawlkit' + (crawlerInstance.name ? `:${crawlerInstance.name}` : '');
    const logger = require('./logger')(prefix);
    logger.info(`Starting to crawl. Concurrent PhantomJS browsers: ${crawlerInstance.concurrency}.`);
    const pool = createPhantomPool(logger, crawlerInstance.concurrency, crawlerInstance.phantomParameters, crawlerInstance.browserCookies, prefix);
    const seen = new Set();

    return timedRun(logger, (done) => {
        if (!crawlerInstance.url) {
            throw new Error(`Defined url '${crawlerInstance.url}' is not valid.`);
        }

        let q;
        const addUrl = (u) => {
            let url = urijs(u);
            url = url.absoluteTo(defaultAbsoluteTo);
            url.normalize();
            url = url.toString();

            if (!seen.has(url)) {
                logger.info(`Adding ${url}`);
                seen.add(url);
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
                if (scope.tries < crawlerInstance.tries) {
                    logger.info(`Retrying ${scope.url} - adding back to queue.`);
                    q.unshift(cloneScope(scope));
                    return;
                }
                logger.info(`Tried to crawl ${scope.url} ${scope.tries} times. Giving up.`);
            }
            writeResult(scope);
        };

        q = async.queue(
            worker(crawlerInstance, runnerKey, finderKey, prefix, pool, addUrl, processResult),
            crawlerInstance.concurrency
        );

        q.drain = () => {
            logger.debug(`Processed ${seen.size} discovered URLs.`);

            setImmediate(() => {
                logger.debug('Draining pool.');
                pool.drain(() => pool.destroyAllNow());
            });
            done();
        };

        addUrl(crawlerInstance.url);
    });
};
