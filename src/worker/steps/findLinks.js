'use strict'; // eslint-disable-line
const path = require('path');
const once = require('once');
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

module.exports = (scope, workerLogger, finder, finderParameters, addUrl, timeout) => {
    return (cb) => {
        if (!finder) {
            return cb();
        }

        let timeoutHandler;
        const done = once((err) => {
            clearTimeout(timeoutHandler);
            cb(err);
        });
        function phantomCallback(err, urls) {
            if (err) {
                return done(err);
            }
            if (urls instanceof Array) {
                workerLogger.info(`Finder discovered ${urls.length} URLs.`);
                urls.forEach((url) => {
                    try {
                    const state = applyUrlFilterFn(getUrlFilter(finder), url, scope.url, addUrl);
                        if (state === false) {
                            workerLogger.debug(`URL ${url} ignored due to URL filter.`);
                        } else if (url !== state) {
                            workerLogger.debug(`${url} was rewritten to ${state}.`);
                        } else {
                            workerLogger.debug(`${url} was added.`);
                        }
                    } catch (e) {
                        workerLogger.debug(`Error on URL filter (${url}, ${scope.url})`);
                        workerLogger.debug(e);
                    }
                });
            } else {
                workerLogger.error('Given finder returned non-Array value');
            }
            done();
        }
        scope.page.onCallback = phantomCallback;
        scope.page.onError = (err, trace) => {
            if (isPhantomError(trace)) {
                phantomCallback(err);
            } else {
                workerLogger.debug(`Page: "${err}" in ${JSON.stringify(trace)}`);
            }
        };
        timeoutHandler = setTimeout(() => {
            phantomCallback(`Finder timed out after ${timeout}ms.`, null);
        }, timeout);
        const params = [getFinderRunnable(finder)].concat(finderParameters || []);
        params.push((err) => {
            if (err) {
                return done(err);
            }
            workerLogger.debug(`Finder code evaluated`);
        });
        scope.page.evaluate.apply(scope.page, params);
    };
};
