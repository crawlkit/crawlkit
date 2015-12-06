'use strict'; // eslint-disable-line

const debug = require('debug');
const once = require('once');
const path = require('path');
const timeoutCallback = require('timeout-callback');
const isPhantomError = require(path.join(__dirname, '..', '..', 'isPhantomError.js'));
const HeadlessError = require('node-phantom-simple/headless_error');

module.exports = (scope, logger, runners, workerLogPrefix, timeout) => {
    return (cb) => {
        logger.debug('Trying to run page runners.');

        if (runners.size === 0) {
            logger.debug('No runners defined');
            return cb();
        }

        const done = once((err) => {
            logger.debug('Runners finished.');
            done.called = true;
            cb(err);
        });
        const runnerIterator = runners[Symbol.iterator]();
        const results = scope.result.runners = {};
        const nextRunner = () => {
            if (done.called) {
                logger.debug('Callback was called already.');
                return;
            }
            const next = runnerIterator.next();
            if (next.done) {
                logger.debug('All runners ran.');
                done();
                return;
            }

            const runnerId = next.value[0];
            const runnerObj = next.value[1];

            const runnerLogPrefix = `${workerLogPrefix}:runner(${runnerId})`;
            const runnerLogger = {
                console: debug(`${runnerLogPrefix}:console:debug`),
                info: debug(`${runnerLogPrefix}:info`),
                debug: debug(`${runnerLogPrefix}:debug`),
                error: debug(`${runnerLogPrefix}:error`),
            };

            const doneAndNext = timeoutCallback(timeout, once((res) => {
                logger.debug(`Runner '${runnerId}' finished.`);
                let err;
                let result;

                if (res instanceof Array) {
                    err = res.shift();
                    result = res.shift();
                } else {
                    err = res;
                }
                results[runnerId] = {};
                if (err) {
                    results[runnerId].error = err;
                    runnerLogger.error(err);
                } else {
                    results[runnerId].result = result;
                    runnerLogger.info(`Finished.`);
                }
                logger.debug('On to next runner.');
                nextRunner();
            }));

            const runner = runnerObj.runner;
            const parameters = runnerObj.parameters;

            Promise.resolve(runner.getCompanionFiles())
            .then((companionFiles) => {
                return Promise.all((companionFiles || []).map((filename) => {
                    return new Promise((injected, reject) => {
                        scope.page.injectJs(filename, (err, result) => {
                            if (err) {
                                runnerLogger.error(err);
                                return reject(err);
                            }
                            if (!result) {
                                runnerLogger.error(`Failed to inject companion file '${filename}' on ${scope.url}`);
                                return reject(`Failed to inject companion file '${filename}'`);
                            }
                            runnerLogger.debug(`Injected companion file '${filename}' on ${scope.url}`);
                            injected();
                        });
                    });
                }));
            }, doneAndNext)
            .then(function run() {
                scope.page.onCallback = doneAndNext;
                scope.page.onError = (err, trace) => {
                    if (isPhantomError(trace)) {
                        doneAndNext(err);
                    } else {
                        runnerLogger.debug(`Page: "${err}" in ${JSON.stringify(trace)}`);
                    }
                };
                scope.page.onConsoleMessage = runnerLogger.console;
                runnerLogger.info(`Started.`);
                const params = [runner.getRunnable()].concat(parameters);
                params.push((err) => {
                    if (err) {
                        return done(err);
                    }
                    logger.debug(`Runner '${runnerId}' evaluated`);
                });
                logger.debug(`Trying to evaluate runner '${runnerId}'`);
                scope.page.evaluate.apply(scope.page, params);
            }, doneAndNext)
            .catch((err) => {
                runnerLogger.debug('Runner caught an error');
                if (err instanceof HeadlessError) {
                    runnerLogger.debug('Phantom died during run.');
                    done(err);
                } else {
                    doneAndNext(err);
                }
            });
        };
        nextRunner();
    };
};
