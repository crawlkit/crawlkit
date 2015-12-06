'use strict'; // eslint-disable-line
const path = require('path');
const once = require('once');
const timeoutCallback = require('timeout-callback');
const isPhantomError = require(path.join(__dirname, '..', '..', 'isPhantomError.js'));
const applyUrlFilterFn = require(path.join(__dirname, '..', '..', 'applyUrlFilterFn.js'));

function getFinderRunnable(finder) {
    if (!finder) {
        return null;
    }
    return finder.getRunnable() || null;
}

function getUrlFilter(finder) {
    return (finder && finder.urlFilter) ? finder.urlFilter.bind(finder) : null;
}

module.exports = (scope, logger, finder, finderParameters, addUrl, timeout) => {
    return (cb) => {
        logger.debug('Trying to run finder.');
        if (!finder) {
            logger.debug('No finder defined.');
            return cb();
        }

        const done = timeoutCallback(timeout, once((err) => {
            logger.debug('Finder ran.');
            done.called = true;
            cb(err);
        }));
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
                    const state = applyUrlFilterFn(getUrlFilter(finder), url, scope.url, addUrl);
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
        scope.page.onCallback = phantomCallback;
        scope.page.onError = (err, trace) => {
            if (isPhantomError(trace)) {
                logger.debug('Finder encountered Phantom error.');
                phantomCallback(err);
            } else {
                logger.debug(`Error in page: "${err}" in ${JSON.stringify(trace)}`);
            }
        };
        const params = [getFinderRunnable(finder)].concat(finderParameters || []);
        params.push((err) => {
            if (err) {
                return done(err);
            }
            logger.debug(`Finder code evaluated`);
        });
        scope.page.evaluate.apply(scope.page, params);
    };
};
