'use strict'; // eslint-disable-line

const debug = require('debug');
const once = require('once');
const path = require('path');
const isPhantomError = require(path.join(__dirname, '..', '..', 'isPhantomError.js'));
const HeadlessError = require('node-phantom-simple/headless_error');

module.exports = (scope, workerLogger, runners, workerLogPrefix, timeout) => {
    return (cb) => {
        if (runners.size === 0) {
            workerLogger.debug('No runners defined');
            return cb();
        }

        let timeoutHandler;
        const done = once((err) => {
            clearTimeout(timeoutHandler);
            cb(err);
        });
        const runnerIterator = runners[Symbol.iterator]();
        const results = scope.result.runners = {};
        const nextRunner = () => {
            const next = runnerIterator.next();
            if (next.done) {
                return done();
            }

            const runnerId = next.value[0];
            const runnerLogPrefix = `${workerLogPrefix}:runner(${runnerId})`;
            const runnerConsole = debug(`${runnerLogPrefix}:console:debug`);
            const runnerInfo = debug(`${runnerLogPrefix}:info`);
            const runnerDebug = debug(`${runnerLogPrefix}:debug`);
            const runnerError = debug(`${runnerLogPrefix}:error`);

            function doneAndNext(err, result) {
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
            }
            const runnerObj = next.value[1];
            const runner = runnerObj.runner;
            const parameters = runnerObj.parameters;

            Promise.resolve(runner.getCompanionFiles())
            .then((companionFiles) => {
                return Promise.all((companionFiles || []).map((filename) => {
                    return new Promise((injected, reject) => {
                        scope.page.injectJs(filename, (err, result) => {
                            if (err) {
                                runnerError(err);
                                return reject(err);
                            }
                            if (!result) {
                                runnerError(`Failed to inject companion file '${filename}' on ${scope.url}`);
                                return reject(`Failed to inject companion file '${filename}'`);
                            }
                            runnerDebug(`Injected companion file '${filename}' on ${scope.url}`);
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
                        runnerDebug(`Page: "${err}" in ${JSON.stringify(trace)}`);
                    }
                };
                scope.page.onConsoleMessage = runnerConsole;
                runnerInfo(`Started.`);
                timeoutHandler = setTimeout(() => {
                    doneAndNext(`Timed out after ${timeout}ms.`, null);
                }, timeout);
                const params = [runner.getRunnable()].concat(parameters);
                params.push((err) => {
                    if (err) {
                        return done(err);
                    }
                    workerLogger.debug(`Runner '${runnerId}' evaluated`);
                });
                workerLogger.debug(`Trying to evaluate runner '${runnerId}'`);
                scope.page.evaluate.apply(scope.page, params);
            }, doneAndNext)
            .catch((err) => {
                if (err instanceof HeadlessError) {
                    done(err);
                } else {
                    doneAndNext(err);
                }
            });
        };
        nextRunner();
    };
};
