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
        scope.retry();
        const workerLogPrefix = `${prefix}:task(${scope.id})`;
        const workerLogger = logger(workerLogPrefix);

        const triesLog = scope.tries > 1 ? ` (attempt ${scope.tries})` : '';
        workerLogger.info(`Took ${scope.url} from queue${triesLog}.`);
        timedRun(workerLogger, (done) => {
            const workerFinished = callbackTimeout(once((err) => {
                scope.stop();
                if (err) {
                    workerLogger.error(err);
                    scope.result.error = err; // eslint-disable-line no-param-reassign
                }

                if (scope.page) {
                    workerLogger.debug(`Attempting to close page.`);
                    scope.page.close();
                    workerLogger.debug(`Page closed.`);
                }
                if (scope.browser) {
                    if (err instanceof HeadlessError) {
                        // take no chances
                        // if there was an error on Phantom side, we should get rid of the instance
                        workerLogger.info(`Notifying pool to destroy Phantom instance.`);
                        pool.destroy(scope.browser);
                        workerLogger.debug(`Phantom instance destroyed.`);
                    } else {
                        workerLogger.debug(`Attempting to release Phantom instance.`);
                        pool.release(scope.browser);
                        workerLogger.debug(`Phantom instance released to pool.`);
                    }
                    scope.clearBrowser();
                }
                processResult(scope, err);
                done();
            }), crawlerInstance.timeout, `Worker timed out after ${crawlerInstance.timeout}ms.`);

            const steps = [
                step.acquireBrowser(scope, workerLogger, pool),
                step.createPage(scope, workerLogger),
                step.setPageSettings(scope, workerLogger, crawlerInstance),
                step.openPage(scope, workerLogger, addUrl, crawlerInstance),
                step.findLinks(scope, workerLogger, getFinder(), getFinderParameters(), addUrl),
                step.pageRunners(scope, workerLogger, getRunners(), workerLogPrefix),
            ].map((fn) => immediateStopDecorator(scope, fn));

            async.waterfall(steps, workerFinished);
        })(queueItemFinished);
    };
};
