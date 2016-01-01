'use strict'; // eslint-disable-line

const HeadlessError = require('node-phantom-simple/headless_error');
const async = require('async');
const once = require('once');
const callbackTimeout = require('callback-timeout');

const immediateStopDecorator = require('./immediateStopDecorator');
const step = require('./loadSteps');
const timedRun = require('../timedRun');
const logger = require('../logger');

/**
* Creates a worker to work on a task package
*
* @private
* @param {!CrawlKit} crawlerInstance The {@link CrawlKit} instance.
*/
module.exports = (crawlerInstance, runnerKey, finderKey, prefix, pool, addUrl, processResult) => {
    /**
     * Gets a finder definition of a {@link CrawlKit} instance.
     *
     * @private
     * @return {Finder} the finder instance set via {@link CrawlKit#setFinder}.
     */
    function getFinder() {
        return crawlerInstance[finderKey].finder;
    }

    /**
     * Gets finder parameters of a {@link CrawlKit} instance.
     *
     * @private
     * @return {Array} the finder parameters (if set)
     */
    function getFinderParameters() {
        return crawlerInstance[finderKey].parameters;
    }

    /**
     * Gets the {@link Runner} instances set for a {@link CrawlKit} instance.
     *
     * @private
     * @return {Map} a map of {@link Runner} instances.
     */
    function getRunners() {
        return crawlerInstance[runnerKey];
    }

    return (scope, queueItemFinished) => {
        scope.tries++;
        const workerLogPrefix = `${prefix}:task(${scope.id})`;
        const workerLogger = logger(workerLogPrefix);

        workerLogger.info(`Took ${scope.url} from queue` + (scope.tries > 1 ? ` (attempt ${scope.tries})` : '') + '.');
        timedRun(workerLogger, (stopWorkerTimer) => {
            const workerFinished = callbackTimeout(once((err) => {
                scope.stop = true;
                if (err) {
                    workerLogger.error(err);
                    scope.result.error = err;
                }

                if (scope.page) {
                    workerLogger.debug(`Attempting to close page.`);
                    scope.page.close();
                    workerLogger.debug(`Page closed.`);
                }
                if (scope.browser) {
                    if (err instanceof HeadlessError) {
                        // take no chances - if there was an error on Phantom side, we should get rid of the instance
                        workerLogger.info(`Notifying pool to destroy Phantom instance.`);
                        pool.destroy(scope.browser);
                        workerLogger.debug(`Phantom instance destroyed.`);
                    } else {
                        workerLogger.debug(`Attempting to release Phantom instance.`);
                        pool.release(scope.browser);
                        workerLogger.debug(`Phantom instance released to pool.`);
                    }
                    scope.browser = null;
                }
                stopWorkerTimer();
                processResult(scope, err);
                queueItemFinished();
            }), crawlerInstance.timeout, `Worker timed out after ${crawlerInstance.timeout}ms.`);

            async.waterfall([
                immediateStopDecorator(scope, step.acquireBrowser(scope, workerLogger, pool)),
                immediateStopDecorator(scope, step.createPage(scope, workerLogger)),
                immediateStopDecorator(scope, step.setPageSettings(scope, workerLogger, crawlerInstance.phantomPageSettings, crawlerInstance.followRedirects)),
                immediateStopDecorator(scope, step.openPage(scope, workerLogger, addUrl, crawlerInstance.followRedirects, crawlerInstance.redirectFilter)),
                immediateStopDecorator(scope, step.findLinks(scope, workerLogger, getFinder(), getFinderParameters(), addUrl)),
                immediateStopDecorator(scope, step.pageRunners(scope, workerLogger, getRunners(), workerLogPrefix)),
            ], workerFinished);
        });
    };
};
