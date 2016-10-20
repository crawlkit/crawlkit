'use strict'; // eslint-disable-line

const poolModule = require('generic-pool');
const async = require('async');
const driver = require('node-phantom-simple');
const phantomjs = require('phantomjs-prebuilt');
const debug = require('debug');

module.exports = (logger, crawlerInstance, prefix) => {
  const poolDebug = {};
  const concurrency = crawlerInstance.concurrency;
  const phantomParameters = crawlerInstance.phantomParameters;
  const browserCookies = crawlerInstance.browserCookies;

  return poolModule.Pool({ // eslint-disable-line new-cap
    create: (callback) => {
      async.waterfall([
        function createPhantom(done) {
          logger.debug('Creating PhantomJS instance');
          driver.create({
            path: phantomjs.path,
            parameters: phantomParameters,
          }, done);
        },
        function addCookies(browser, done) {
          logger.debug('Adding cookies.');
          if (browserCookies.length === 0) {
            logger.debug('No cookies to add.');
            done(null, browser);
            return;
          }
          Promise.all(browserCookies.map(cookie => new Promise((success, reject) => {
            logger.debug(`adding cookie '${cookie.name}=${cookie.value}'`);
            browser.addCookie(cookie, (cookieErr) => {
              if (cookieErr) {
                logger.error(`adding cookie '${cookie.name}' failed`);
                reject(cookieErr);
                return;
              }
              success();
            });
          }))).then(() => {
            logger.debug('finished adding cookies');
            done(null, browser);
          }, (cookieErr) => {
            logger.debug('Error adding cookies.');
            done(cookieErr, browser);
          });
        },
      ], callback);
    },
    destroy: (browser) => {
      logger.debug('Destroying PhantomJS instance.');
      browser.exit();
      logger.debug('PhantomJS instance destroyed.');
    },
    refreshIdle: false,
    max: concurrency,
    log: (message, level) => {
      poolDebug[level] = poolDebug[level] || debug(`${prefix}:pool:phantomjs:${level}`);
      poolDebug[level](message);
    },
  });
};
