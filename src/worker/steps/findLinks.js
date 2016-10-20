'use strict'; // eslint-disable-line
const once = require('once');
const callbackTimeout = require('callback-timeout');
const isPhantomError = require('../../isPhantomError.js');
const applyUrlFilterFn = require('../../applyUrlFilterFn.js');
const Finder = require('../../Finder.js');

function getFinderRunnable(finder) {
  if (!finder) {
    return null;
  }
  return finder.getRunnable() || null;
}

function getUrlFilter(finder) {
  return (finder && finder.urlFilter) ? finder.urlFilter.bind(finder) : null;
}

module.exports = (scope, logger, finder, finderParameters, addUrl) => (cb) => {
  logger.debug('Trying to run finder.');
  if (!finder) {
    logger.debug('No finder defined.');
    cb();
    return;
  }

  const timeout = finder.timeout || Finder.DEFAULT_TIMEOUT;
  const done = callbackTimeout(once((err) => {
    logger.debug('Finder ran.');
    done.called = true;
    cb(err);
  }), timeout, `Finder timed out after ${timeout}ms.`);

  function phantomCallback(err, urls) {
    if (done.called) {
      logger.debug('Callback alread called.');
      return;
    }
    if (err) {
      logger.debug('Finder errored.');
      done(err);
      return;
    }
    if (urls instanceof Array) {
      logger.info(`Finder discovered ${urls.length} URLs.`);
      urls.forEach((url) => {
        try {
          const filter = getUrlFilter(finder);
          const state = applyUrlFilterFn(filter, url, scope.url, addUrl);
          if (state === false) {
            logger.debug(`URL ${url} ignored due to URL filter.`);
          } else if (url !== state) {
            logger.debug(`${url} was rewritten to ${state}.`);
          } else {
            logger.debug(`${url} was added.`);
          }
        } catch (e) {
          logger.debug(`Error on URL filter (${url}, ${scope.url})`);
          logger.debug(e);
        }
      });
    } else {
      logger.error('Given finder returned non-Array value');
    }
    done();
  }
  const phantomError = (err, trace) => {
    if (isPhantomError(trace)) {
      logger.debug('Finder encountered Phantom error.');
      phantomCallback(err);
    } else {
      logger.debug(`Error in page: "${err}" in ${JSON.stringify(trace)}`);
    }
  };

  /* eslint-disable no-param-reassign */
  scope.page.onCallback = phantomCallback;
  scope.page.onError = phantomError;
  /* eslint-enable no-param-reassign */

  const params = [getFinderRunnable(finder)].concat(finderParameters || []);
  params.push((err) => {
    if (err) {
      done(err);
      return;
    }
    logger.debug('Finder code evaluated');
  });
  scope.page.evaluate.apply(scope.page, params);
};
