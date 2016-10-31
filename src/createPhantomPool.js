'use strict'; // eslint-disable-line

const genericPool = require('generic-pool');
const async = require('async');
const driver = require('node-phantom-simple');
const phantomjs = require('phantomjs-prebuilt');

module.exports = (logger, crawlerInstance) => {
  const concurrency = crawlerInstance.concurrency;
  const phantomParameters = crawlerInstance.phantomParameters;
  const browserCookies = crawlerInstance.browserCookies;

  const config = {
    refreshIdle: false,
    max: concurrency,
  };

  const factory = {
    create: () => new Promise((createResolve, createReject) => {
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
      ], err => (err ? createReject(err) : createResolve()));
    }),
    destroy: (browser) => {
      logger.debug('Destroying PhantomJS instance.');
      browser.exit();
      logger.debug('PhantomJS instance destroyed.');
      return Promise.resolve(null);
    },
  };

  return genericPool.createPool(factory, config);
};
