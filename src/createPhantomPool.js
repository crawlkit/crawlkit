'use strict'; // eslint-disable-line

const poolModule = require('generic-pool');
const async = require('async');
const driver = require('node-phantom-simple');
const phantomjs = require('phantomjs');
const debug = require('debug');

module.exports = (logger, concurrency, phantomParameters, browserCookies) => {
    const poolDebug = {};

    return poolModule.Pool({ // eslint-disable-line
        name: 'phantomjs',
        create: (callback) => {
            async.waterfall([
                function createPhantom(done) {
                    driver.create({
                        path: phantomjs.path,
                        parameters: phantomParameters,
                    }, done);
                },
                function addCookies(browser, done) {
                    if (browserCookies.length === 0) {
                        return done(null, browser);
                    }
                    Promise.all(browserCookies.map((cookie) => {
                      return new Promise((success, reject) => {
                          logger.debug(`adding cookie '${cookie.name}=${cookie.value}'`);
                          browser.addCookie(cookie, (cookieErr) => {
                              if (cookieErr) {
                                  logger.error(`adding cookie '${cookie.name}' failed`);
                                  return reject(cookieErr);
                              }
                              success();
                          });
                      });
                    })).then(() => {
                        logger.debug(`finished adding cookies`);
                        done(null, browser);
                    }, (cookieErr) => {
                        done(cookieErr, browser);
                    });
                },
            ], callback);
        },
        destroy: (browser) => {
            browser.exit();
        },
        max: concurrency,
        min: 1,
        log: (message, level) => {
            poolDebug[level] = poolDebug[level] || debug(`crawlkit:pool:phantomjs:${level}`);
            poolDebug[level](message);
        },
    });
};
