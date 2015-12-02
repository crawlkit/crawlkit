'use strict'; // eslint-disable-line

const d = require('debug');
const once = require('once');
const path = require('path');
const isPhantomError = require(path.join(__dirname, '..', '..', 'isPhantomError.js'));

module.exports = (scope, workerLogger, runners, workerLogPrefix, timeout) => {
    return (cb) => {
        const done = once(cb);

        if (runners.size === 0) {
            workerLogger.debug('No runners defined');
            return done();
        }
        const runnerIterator = runners[Symbol.iterator]();
        const results = scope.result.runners = {};
        const nextRunner = () => {
            const next = runnerIterator.next();
            if (next.done) {
                return done();
            }
            let timeoutHandler;
            const runnerId = next.value[0];
            const runnerObj = next.value[1];
            const runner = runnerObj.runner;
            const parameters = runnerObj.parameters;

            Promise.resolve(runner.getCompanionFiles())
            .then((companionFiles) => {
              return Promise.all((companionFiles || []).map((filename) => {
                  return new Promise((injected, reject) => {
                      scope.page.injectJs(filename, (err) => {
                          if (err) {
                              workerLogger.error(`Failed to inject companion file '${filename}' for runner '${runnerId}' on ${scope.url}`);
                              return reject(err);
                          }
                          workerLogger.debug(`Injected companion file '${filename}' for runner '${runnerId}' on ${scope.url}`);
                          injected();
                      });
                  });
              }));
          }, done)
            .then(function run() {
                const runnerLogPrefix = `${workerLogPrefix}:runner(${runnerId})`;
                const runnerConsole = d(`${runnerLogPrefix}:console:debug`);
                const runnerInfo = d(`${runnerLogPrefix}:info`);
                const runnerDebug = d(`${runnerLogPrefix}:debug`);
                const runnerError = d(`${runnerLogPrefix}:error`);

                const phantomCallback = (err, result) => {
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
                };
                scope.page.onCallback = phantomCallback;
                scope.page.onError = (err, trace) => {
                    if (isPhantomError(trace)) {
                        phantomCallback(err);
                    } else {
                        runnerDebug(`Page: "${err}" in ${JSON.stringify(trace)}`);
                    }
                };
                scope.page.onConsoleMessage = runnerConsole;
                runnerInfo(`Started.`);
                timeoutHandler = setTimeout(() => {
                    phantomCallback(`Runner '${runnerId}' timed out after ${timeout}ms.`, null);
                }, timeout);
                const params = [runner.getRunnable()].concat(parameters);
                params.push((err) => {
                    if (err) {
                        clearTimeout(timeoutHandler);
                        return done(err);
                    }
                    workerLogger.debug(`Runner '${runnerId}' evaluated`);
                });
                scope.page.evaluate.apply(scope.page, params);
            }, done)
            .catch((err) => {
                clearTimeout(timeoutHandler);
                done(err);
            });
        };
        nextRunner();
    };
};
