'use strict'; // eslint-disable-line

const debug = require('debug');
const once = require('once');
const callbackTimeout = require('callback-timeout');
const isPhantomError = require('../../isPhantomError.js');
const Runner = require('../../Runner.js');
const l = require('../../logger');

const TransformationError = require('../../errors.js').TransformationError;
const HeadlessError = require('node-phantom-simple/headless_error');

module.exports = (scope, logger, runners, workerLogPrefix) => (cb) => {
  logger.debug('Trying to run page runners.');

  if (runners.size === 0) {
    logger.debug('No runners defined');
    cb();
    return;
  }

  const done = once((err) => {
    logger.debug('Runners finished.');
    done.called = true;
    cb(err);
  });
  const runnerIterator = runners[Symbol.iterator]();
  const results = scope.result.runners = {}; // eslint-disable-line no-param-reassign
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
    const runnerLogger = l(runnerLogPrefix);
    runnerLogger.console = debug(`${runnerLogPrefix}:console:debug`);

    const timeout = runner.timeout || Runner.DEFAULT_TIMEOUT;
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
      let tasks;
      if (err) {
        tasks = Promise.resolve();
        runnerLogger.error(err);
        results[runnerId].error = err;
      } else {
        if (typeof runner.transformResult === 'function') {
          runnerLogger.debug('Transforming result');
          tasks = new Promise((resolve, reject) => {
            // we need to wrap this in case an error is thrown
            runner.transformResult(result).then(resolve, reject);
          });
        } else {
          // no transformation method = result used as-is
          tasks = Promise.resolve(result);
        }
        tasks = tasks.then((possiblyTransformedResult) => {
          results[runnerId].result = possiblyTransformedResult;
        }, (transformationError) => {
          runnerLogger.error(transformationError);
          results[runnerId].error = new TransformationError(transformationError);
        });
      }
      tasks.then(() => {
        runnerLogger.info('Finished.');
        logger.debug('On to next runner.');
        nextRunner();
      });
    }), timeout, `Runner timed out after ${timeout}ms.`);

    Promise.resolve(runner.getCompanionFiles())
      .then((companionFiles) => {
        const files = companionFiles || [];
        if (files.length) {
          runnerLogger.debug(`Starting to inject ${files.length} companion files`);
        }
        return Promise.all(files.map(filename => new Promise((injected, reject) => {
          scope.page.injectJs(filename, (err, result) => {
            if (err) {
              runnerLogger.error(err);
              reject(err);
              return;
            }
            if (!result) {
              runnerLogger.error(`Failed to inject '${filename}'`);
              reject(`Failed to inject '${filename}'`);
              return;
            }
            runnerLogger.debug(`Injected '${filename}'`);
            injected();
          });
        })));
      }, doneAndNext)
      .then(() => {
        const onError = (err, trace) => {
          if (isPhantomError(trace)) {
            doneAndNext(err);
          } else {
            runnerLogger.debug(`Page: "${err}" in ${JSON.stringify(trace)}`);
          }
        };

        /* eslint-disable no-param-reassign */
        scope.page.onError = onError;
        scope.page.onCallback = doneAndNext;
        scope.page.onConsoleMessage = runnerLogger.console;
        /* eslint-enable no-param-reassign */

        runnerLogger.info('Started.');
        const params = [runner.getRunnable()].concat(parameters);
        params.push((err) => {
          if (err) {
            doneAndNext(err);
            return;
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
