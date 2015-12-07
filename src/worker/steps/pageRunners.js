'use strict'; // eslint-disable-line

const debug = require('debug');
const once = require('once');
const path = require('path');
const callbackTimeout = require('callback-timeout');
const basePath = path.join(__dirname, '..', '..');
const isPhantomError = require(path.join(basePath, 'isPhantomError.js'));
const Runner = require(path.join(basePath, 'Runner.js'));

const HeadlessError = require('node-phantom-simple/headless_error');

module.exports = (scope, logger, runners, workerLogPrefix) => {
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
            const runner = runnerObj.runner;
            const parameters = runnerObj.parameters;

            const runnerLogPrefix = `${workerLogPrefix}:runner(${runnerId})`;
            const runnerLogger = {
                console: debug(`${runnerLogPrefix}:console:debug`),
                info: debug(`${runnerLogPrefix}:info`),
                debug: debug(`${runnerLogPrefix}:debug`),
                error: debug(`${runnerLogPrefix}:error`),
            };

            const doneAndNext = callbackTimeout(once((res) => {
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
            }), runner.timeout || Runner.DEFAULT_TIMEOUT);

            Promise.resolve(runner.getCompanionFiles())
            .then((companionFiles) => {
                const files = companionFiles || [];
                if (files.length) {
                    runnerLogger.debug(`Starting to inject ${files.length} companion files`);
                }
                return Promise.all(files.map((filename) => {
                    return new Promise((injected, reject) => {
                        scope.page.injectJs(filename, (err, result) => {
                            if (err) {
                                runnerLogger.error(err);
                                return reject(err);
                            }
                            if (!result) {
                                runnerLogger.error(`Failed to inject '${filename}'`);
                                return reject(`Failed to inject '${filename}'`);
                            }
                            runnerLogger.debug(`Injected '${filename}'`);
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
                        return doneAndNext(err);
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
