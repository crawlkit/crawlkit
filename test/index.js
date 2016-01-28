'use strict'; // eslint-disable-line
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const express = require('express');
const path = require('path');
const freeport = require('freeport');
const auth = require('http-auth');
const http = require('http');
const httpProxy = require('http-proxy');
const phantomjs = require('phantomjs-prebuilt');

const HeadlessError = require(path.join('node-phantom-simple', 'headless_error'));
const TimeoutError = require(path.join('callback-timeout', 'errors')).TimeoutError;
const srcFolder = path.join(__dirname, '..', 'src');
const errors = require(path.join(srcFolder, 'errors.js'));

const pkg = require(path.join(__dirname, '..', 'package.json'));
const CrawlKit = require(path.join(__dirname, '..', pkg.main));
const Finder = require(path.join(srcFolder, 'Finder.js'));
const Runner = require(path.join(srcFolder, 'Runner.js'));

const genericLinkFinder = require(path.join('..', 'finders', 'genericAnchors.js'));

chai.should();
chai.use(chaiAsPromised);
chai.use(sinonChai);
const expect = chai.expect;

const basic = auth.basic({
  realm: 'Restricted area',
}, (username, password, cb) => {
  cb(username === 'foo' && password === 'bar');
});

class DelayedRunner {
  getCompanionFiles() {
    return [];
  }

  getRunnable() {
    return function delayedRunner(delay, fail) {
      window.setTimeout(
        function delayedCallback() { // eslint-disable-line prefer-arrow-callback
          if (fail) {
            throw new Error('runner failure');
          }
          window.callPhantom(null, 'success');
        }, delay);
    };
  }
}

class GenericLinkFinder {
  constructor(urlFilter) {
    this.urlFilter = urlFilter;
  }

  getRunnable() {
    return genericLinkFinder;
  }
}

function createCrawler(url) {
  const crawler = new CrawlKit(url);
  crawler.tries = 1;
  return crawler;
}

describe('CrawlKit', function main() {
  this.timeout(5 * 60 * 1000); // crawling can take a while
  let server;
  let proxy;
  let url;
  let proxyUrl;
  let port;
  const host = '0.0.0.0';

  before((done) => {
    freeport((err, p) => {
      if (err) {
        throw err;
      }
      port = p;

      const app = express();
      app.use(express.static(path.join(__dirname, 'fixtures', 'website')));

      app.get('/custom404withHtmlAnswer', (req, res) => {
        res.status(404).send('<html>Not found</html>');
      });

      app.get('*', (req, res) => {
        res.status(404).send();
      });

      server = app.listen(port);

      url = `http://${host}:${port}/`;

      freeport((poxyErr, proxyPort) => {
        if (poxyErr) {
          throw poxyErr;
        }

        const routingProxy = new httpProxy.createProxyServer(); // eslint-disable-line
        proxy = http.createServer(basic, (req, res) => {
          routingProxy.web(req, res, {
            target: url,
          });
        });
        proxy.listen(proxyPort);
        proxyUrl = `http://${host}:${proxyPort}/`;
        done();
      });
    });
  });

  after((done) => {
    proxy.close(() => {
      server.close();
      done();
    });
  });


  describe('should be able to crawl', () => {
    it('a website', () => {
      const crawler = new CrawlKit(url);
      const results = {};
      results[url] = {};
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });

    it('and identify itself properly', () => {
      const crawler = createCrawler(url);
      crawler.addRunner('userAgent', {
        getCompanionFiles: () => [],
        getRunnable: () => function getUserAgent() {
          window.callPhantom(null, navigator.userAgent);
        },
      });
      const results = {};
      results[url] = {
        runners: {
          userAgent: {
            result: `CrawlKit/${pkg.version} (PhantomJS/${phantomjs.version})`,
          },
        },
      };
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });

    it('should error if no URL was given', () => {
      const crawler = createCrawler();
      return crawler.crawl().should.eventually.be.rejected;
    });

    it('should error if erroneous URL was given', () => {
      const crawler = createCrawler('mailto:bla@bla');
      return crawler.crawl().should.eventually.be.rejected;
    });

    describe('worker', () => {
      it('should time out', () => {
        const crawler = createCrawler(url);
        crawler.timeout = 5;
        const results = {};
        results[url] = {
          error: new TimeoutError('Worker timed out after 5ms.'),
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should time out and release properly', () => {
        const crawler = createCrawler(url);
        crawler.timeout = 500;
        crawler.setFinder(new GenericLinkFinder(), 2000);

        const results = {};
        results[url] = {
          error: new TimeoutError('Worker timed out after 500ms.'),
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });

    describe('with a finder', () => {
      it('that is custom', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};
        results[`${url}#somehash`] = {};
        results[`${url}other.html`] = {};

        crawler.setFinder(new GenericLinkFinder());
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('that allows parameters', () => {
        const crawler = createCrawler(`${url}other.html`);

        const results = {};
        results[`${url}other.html`] = {};
        results[`${url}ajax.html`] = {};

        crawler.setFinder(new GenericLinkFinder(), 2000);
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('that has an incorrect return value', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};

        crawler.setFinder({
          getRunnable: () => function incorrectReturnFilter() {
            window.callPhantom(null, 'notAnArray');
          },
        });
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it(`that doesn't return URLs`, () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};
        results[`${url}other.html`] = {};
        results[`${url}hidden.html`] = {};

        crawler.setFinder({
          getRunnable: () => function incorrectReturnFilter() {
            window.callPhantom(null, [
              'other.html',
              null,
              'hidden.html',
            ]);
          },
        });
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('that is erroneous', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {
          error: 'Some arbitrary error',
        };
        crawler.setFinder({
          getRunnable: () => function erroneusFinder() {
            window.callPhantom('Some arbitrary error', null);
          },
        });
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('that throws an exception', () => {
        const crawler = createCrawler(url);
        crawler.tries = 1;

        const results = {};
        results[url] = {
          error: 'Error: Some thrown error',
        };
        crawler.setFinder({
          getRunnable: () => function erroneusFinder() {
            throw new Error('Some thrown error');
          },
        });
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      describe('timeouts', () => {
        const originalTimeout = Finder.DEFAULT_TIMEOUT;

        beforeEach(() => {
          Finder.DEFAULT_TIMEOUT = 1234;
        });

        afterEach(() => {
          Finder.DEFAULT_TIMEOUT = originalTimeout;
        });

        it('that never returns (use given timeout)', () => {
          const crawler = createCrawler(url);

          const results = {};
          results[url] = {
            error: new TimeoutError('Finder timed out after 200ms.'),
          };

          crawler.setFinder({
            getRunnable: () => function neverReturningFilter() {},
            timeout: 200,
          });
          return crawler.crawl().should.eventually.deep.equal({
            results,
          });
        });

        it('that never returns (use default timeout)', () => {
          const crawler = createCrawler(url);

          const results = {};
          results[url] = {
            error: new TimeoutError(
              `Finder timed out after ${Finder.DEFAULT_TIMEOUT}ms.`
            ),
          };

          crawler.setFinder({
            getRunnable: () => function neverReturningFilter() {},
          });
          return crawler.crawl().should.eventually.deep.equal({
            results,
          });
        });

        it('should try X times in case of timeout', () => {
          const crawler = createCrawler(url);
          crawler.tries = 2;

          const results = {};
          results[url] = {
            error: new TimeoutError(
              `Finder timed out after ${Finder.DEFAULT_TIMEOUT}ms.`
            ),
          };
          const spy = sinon.spy(() => function neverReturningFilter() {});
          crawler.setFinder({
            getRunnable: spy,
          });
          return crawler.crawl().then((result) => {
            spy.callCount.should.equal(2);
            return result.results;
          }).should.eventually.deep.equal(results);
        });
      });

      it('on a page with errors', () => {
        const crawler = createCrawler(`${url}pageWithError.html`);

        crawler.setFinder(new GenericLinkFinder(), 2000);

        const results = {};
        results[`${url}pageWithError.html`] = {};
        results[`${url}deadend.html`] = {};

        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });

    describe('urlFilter', () => {
      it('and filter the results', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};
        results[`${url}other.html`] = {};

        const spy = sinon.spy((u) => {
          if (u.indexOf('somehash') !== -1) {
            return false;
          }
          return u;
        });

        crawler.setFinder({
          getRunnable: () => genericLinkFinder,
          urlFilter: spy,
        });


        return crawler.crawl().then((result) => {
          spy.callCount.should.equal(2);
          return result.results;
        }).should.eventually.deep.equal(results);
      });

      it('and rewrite the results', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};
        results[`${url}hidden.html`] = {};
        results[`${url}other.html`] = {};

        crawler.setFinder({
          getRunnable: () => genericLinkFinder,
          urlFilter: (u) => {
            if (u.indexOf('somehash') !== -1) {
              return 'hidden.html';
            }
            return u;
          },
        });

        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should handle faulty rewrites', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};

        crawler.setFinder({
          getRunnable: () => genericLinkFinder,
          urlFilter: () => ({}),
        });

        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should be called with the scope where it came from', () => {
        const crawler = createCrawler(url);

        const results = {};
        results[url] = {};
        results[`${url}hidden.html`] = {};

        class HiddenFinder {
          constructor(hiddenUrl) {
            this.hiddenUrl = hiddenUrl;
          }
          getRunnable() {
            return genericLinkFinder;
          }

          urlFilter() {
            return this.hiddenUrl;
          }
        }

        crawler.setFinder(new HiddenFinder(`${url}hidden.html`));

        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });
  });

  it('should fall back to http', () => {
    const crawler = createCrawler(`//${host}:${port}`);
    return crawler.crawl().should.be.fulfilled;
  });

  it('should not fail on dead links', () => {
    const crawler = createCrawler(`${url}deadlinks.html`);

    const results = {};
    results[`${url}deadlinks.html`] = {};
    results[`${url}nonexistent.html`] = {
      error: new errors.StatusError('Not Found', 404),
    };
    results[`${url}404.html`] = {
      error: new errors.StatusError('Not Found', 404),
    };
    crawler.setFinder(new GenericLinkFinder());
    return crawler.crawl().should.eventually.deep.equal({
      results,
    });
  });

  it('should fail for non-2xx answers', () => {
    const crawler = createCrawler(`${url}custom404withHtmlAnswer`);

    const results = {};
    results[`${url}custom404withHtmlAnswer`] = {
      error: new errors.StatusError('Not Found', 404),
    };
    return crawler.crawl().should.eventually.deep.equal({
      results,
    });
  });

  it('should not fail for non-2xx answers on secondary resources', () => {
    const crawler = createCrawler(`${url}pageWith404js.html`);

    const results = {};
    results[`${url}pageWith404js.html`] = {};
    return crawler.crawl().should.eventually.deep.equal({
      results,
    });
  });

  describe('runners', () => {
    it('should be possible to use', () => {
      const crawler = createCrawler(url);

      crawler.addRunner('a', {
        getCompanionFiles: () => [],
        getRunnable: () => function a() {
          window.callPhantom(null, 'a');
        },
      });
      crawler.addRunner('b', {
        getCompanionFiles: () => [],
        getRunnable: () => function b() {
          window.callPhantom('b', null);
        },
      });

      const results = {};
      results[url] = {
        runners: {
          a: {
            result: 'a',
          },
          b: {
            error: 'b',
          },
        },
      };
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });

    it('should be able to run async', () => {
      const crawler = createCrawler(url);
      crawler.addRunner('async', new DelayedRunner(), 2000);

      const results = {};
      results[url] = {
        runners: {
          async: {
            result: 'success',
          },
        },
      };
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });

    describe('transforming result', () => {
      it('should be possible', () => {
        const crawler = createCrawler(url);

        crawler.addRunner('transform', {
          getCompanionFiles: () => [],
          getRunnable: () => function successRunner() {
            window.callPhantom(null, 'success');
          },
          transformResult: (result) => Promise.resolve(result.toUpperCase()),
        });

        const results = {};
        results[url] = {
          runners: {
            transform: {
              result: 'SUCCESS',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('errors should be handled', () => {
        const crawler = createCrawler(url);

        const err = new Error('whatevs');
        crawler.addRunner('transform', {
          getCompanionFiles: () => [],
          getRunnable: () => function successRunner() {
            window.callPhantom(null, 'success');
          },
          transformResult: () => {
            throw err;
          },
        });

        const results = {};
        results[url] = {
          runners: {
            transform: {
              error: new errors.TransformationError(err),
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });

    describe('errors', () => {
      it('should not die on page errors', () => {
        const crawler = createCrawler(`${url}pageWithError.html`);

        crawler.addRunner('success', new DelayedRunner(), 2000);

        const results = {};
        results[`${url}pageWithError.html`] = {
          runners: {
            success: {
              result: 'success',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should die on runner errors', () => {
        const crawler = createCrawler(`${url}pageWithError.html`);

        crawler.addRunner('failure', new DelayedRunner(), 2000, true);

        const results = {};
        results[`${url}pageWithError.html`] = {
          runners: {
            failure: {
              error: 'Error: runner failure',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });

    describe('companion files', () => {
      let companionRunner;

      beforeEach(() => {
        companionRunner = {
          getCompanionFiles: () => [
            path.join(__dirname, 'fixtures/companionA.js'),
            path.join(__dirname, 'fixtures/companionB.js'),
          ],
          getRunnable: () => function callingGlobalRunner() {
            window.companionB();
          },
        };
      });


      it('synchronously', () => {
        const crawler = createCrawler(url);
        crawler.addRunner('companion', companionRunner);

        const results = {};
        results[url] = {
          runners: {
            companion: {
              result: 'success',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('async with a Promise', () => {
        const crawler = createCrawler(url);
        crawler.addRunner('companion', {
          getCompanionFiles: () => Promise.resolve([
            path.join(__dirname, 'fixtures/companionA.js'),
            path.join(__dirname, 'fixtures/companionB.js'),
          ]),
          getRunnable: () => function callingGlobalRunner() {
            window.companionB();
          },
        });

        const results = {};
        results[url] = {
          runners: {
            companion: {
              result: 'success',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should work on a broken website', () => {
        const urlToBrokenWebsite = `${url}pageWithError.immediate.html`;
        const crawler = createCrawler(urlToBrokenWebsite);
        crawler.addRunner('companion', companionRunner);

        const results = {};
        results[urlToBrokenWebsite] = {
          runners: {
            companion: {
              result: 'success',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should recover from unavailable companion files', () => {
        const crawler = createCrawler(url);
        crawler.addRunner('broken', {
          getCompanionFiles: () => [
            '/not/available.js',
            '/not/existent.js',
          ],
          getRunnable: () => function noop() {
            window.callPhantom(null, 'success');
          },
        });

        const results = {};
        results[url] = {
          runners: {
            broken: {
              error: "Failed to inject '/not/available.js'",
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });

    describe('timeouts', () => {
      const originalTimeout = Runner.DEFAULT_TIMEOUT;

      beforeEach(() => {
        Runner.DEFAULT_TIMEOUT = 1234;
      });

      afterEach(() => {
        Runner.DEFAULT_TIMEOUT = originalTimeout;
      });

      it('given timeout', () => {
        const crawler = createCrawler(url);

        crawler.addRunner('x', {
          timeout: 200,
          getCompanionFiles: () => [],
          getRunnable: () => function noop() {},
        });

        const results = {};
        results[url] = {
          runners: {
            x: {
              error: new TimeoutError('Runner timed out after 200ms.'),
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('default timeout', () => {
        const crawler = createCrawler(url);

        crawler.addRunner('x', {
          getCompanionFiles: () => [],
          getRunnable: () => function noop() {},
        });

        const results = {};
        results[url] = {
          runners: {
            x: {
              error: new TimeoutError(
                `Runner timed out after ${Runner.DEFAULT_TIMEOUT}ms.`
              ),
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('multiple', () => {
        const crawler = createCrawler(url);

        crawler.addRunner('x', {
          timeout: 100,
          getCompanionFiles: () => [],
          getRunnable: () => function noop() {},
        });

        crawler.addRunner('y', {
          timeout: 100,
          getCompanionFiles: () => [],
          getRunnable: () => function success() {
            window.callPhantom(null, 'success');
          },
        });

        crawler.addRunner('z', {
          timeout: 100,
          getCompanionFiles: () => [],
          getRunnable: () => function noop() {},
        });

        const results = {};
        results[url] = {
          runners: {
            x: {
              error: new TimeoutError('Runner timed out after 100ms.'),
            },
            y: {
              result: 'success',
            },
            z: {
              error: new TimeoutError('Runner timed out after 100ms.'),
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });

    describe('Parameters', () => {
      it('should accept one parameter', () => {
        const crawler = createCrawler(url);
        crawler.addRunner('param', {
          getCompanionFiles: () => [],
          getRunnable: () => function callingGlobalRunner(a) {
            window.callPhantom(null, a);
          },
        }, 'a');

        const results = {};
        results[url] = {
          runners: {
            param: {
              result: 'a',
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should accept multiple parameters', () => {
        const crawler = createCrawler(url);
        crawler.addRunner('param', {
          getCompanionFiles: () => [],
          getRunnable: () => function callingGlobalRunner(a, b, c) {
            window.callPhantom(null, [a, b, c]);
          },
        }, 'a', 'b', 'c');

        const results = {};
        results[url] = {
          runners: {
            param: {
              result: ['a', 'b', 'c'],
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });

      it('should default missing parameters to undefined', () => {
        const crawler = createCrawler(url);
        crawler.addRunner('param', {
          getCompanionFiles: () => [],
          getRunnable: () => function callingGlobalRunner(a) {
            window.callPhantom(null, typeof a === 'undefined');
          },
        });

        const results = {};
        results[url] = {
          runners: {
            param: {
              result: true,
            },
          },
        };
        return crawler.crawl().should.eventually.deep.equal({
          results,
        });
      });
    });
  });

  describe('redirects', () => {
    it.skip('should not be followed by default', () => {
      // This is currently marked as skipped, because `navigationLocked`
      // seems to make the Phantom instance crash
      const crawler = createCrawler(`${url}redirect.html`);

      crawler.setFinder(new GenericLinkFinder(), 1000);

      const results = {};
      results[`${url}redirect.html`] = {};
      results[`${url}redirect.from.html`] = {};
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });

    it('should be followed when the according setting is enabled', () => {
      const redirectUrl = `${url}redirect.html`;
      const targetUrl = `${url}redirected.html`;
      const crawler = createCrawler(redirectUrl);
      crawler.followRedirects = true;
      const results = {};
      results[redirectUrl] = {
        error: new errors.RedirectError('Redirected', targetUrl),
      };
      results[targetUrl] = {};
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });

    it('should be checked against the redirectFilter if available', () => {
      const externalRedirectUrl = `${url}redirect.external.html`;
      const crawler = createCrawler(externalRedirectUrl);
      crawler.redirectFilter = sinon.spy(() => false);
      crawler.followRedirects = true;
      const results = {};
      results[externalRedirectUrl] = {
        error: 'URL http://www.google.com/ was not followed',
      };

      return crawler.crawl().then((data) => {
        crawler.redirectFilter.should.have.been.calledOnce;
        crawler.redirectFilter.should.have.been.calledWith(
          'http://www.google.com/',
          externalRedirectUrl
        );
        return data;
      }).should.eventually.deep.equal({
        results,
      });
    });
  });

  describe('cookies', () => {
    it('should be added to the page if given', () => {
      const crawler = createCrawler(url);

      crawler.browserCookies = [{
        name: 'cookie',
        value: 'monster',
        path: '/',
        domain: host,
      }];

      crawler.addRunner('cookies', {
        getCompanionFiles: () => [],
        getRunnable: () => function getCookies() {
          window.callPhantom(null, document.cookie);
        },
      });

      const results = {};
      results[url] = {
        runners: {
          cookies: {
            result: 'cookie=monster',
          },
        },
      };
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });
  });

  describe('settings', () => {
    it('should be possible to set a page setting', () => {
      const crawler = createCrawler(url);
      crawler.phantomPageSettings = {
        'settings.userAgent': 'Mickey Mouse',
      };
      crawler.addRunner('agent', {
        getCompanionFiles: () => [],
        getRunnable: () => function userAgentRunner() {
          window.callPhantom(null, navigator.userAgent);
        },
      });

      const results = {};
      results[url] = {
        runners: {
          agent: {
            result: 'Mickey Mouse',
          },
        },
      };
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });


    it('should be possible to set basic auth headers', () => {
      const crawler = createCrawler(proxyUrl);
      crawler.phantomPageSettings = {
        'settings.userName': 'foo',
        'settings.password': 'bar',
      };

      const results = {};
      results[proxyUrl] = {};
      results[`${proxyUrl}#somehash`] = {};
      results[`${proxyUrl}other.html`] = {};

      crawler.setFinder(new GenericLinkFinder());
      return crawler.crawl().should.eventually.deep.equal({
        results,
      });
    });
  });

  describe('resilience', () => {
    it('should be able to retry failed attempts when Phantom dies', () => {
      const crawler = createCrawler(url);
      let fails = crawler.tries = 3;
      const flakyRunnable = sinon.spy(() => {
        if (--fails > 0) {
          throw new HeadlessError();
        }
        return function resolvingFunction() {
          window.callPhantom(null, 'final result');
        };
      });

      crawler.addRunner('flaky', {
        getCompanionFiles: () => [],
        getRunnable: flakyRunnable,
      });

      const results = {};
      results[url] = {
        runners: {
          flaky: {
            result: 'final result',
          },
        },
      };

      return crawler.crawl().then((result) => {
        flakyRunnable.should.have.been.calledThrice;
        return result;
      }).should.eventually.deep.equal({
        results,
      });
    });

    describe('should only try every so often', () => {
      let crawler;
      let flakyRunnable;
      let results;

      beforeEach(() => {
        crawler = new CrawlKit(url);

        flakyRunnable = sinon.spy(() => {
          throw new HeadlessError();
        });

        crawler.addRunner('flaky', {
          getCompanionFiles: () => [],
          getRunnable: flakyRunnable,
        });

        results = {};
        results[url] = {
          error: {
            message: undefined,
            name: 'HeadlessError',
          },
          runners: {},
        };
      });

      it('every = default', () => { // eslint-disable-line arrow-body-style
        return crawler.crawl().then((result) => {
          flakyRunnable.should.have.been.calledThrice;
          return result;
        }).should.eventually.deep.equal({
          results,
        });
      });

      it('or how many times defined', () => {
        crawler.tries = 2;

        return crawler.crawl().then((result) => {
          flakyRunnable.should.have.been.calledTwice;
          return result;
        }).should.eventually.deep.equal({
          results,
        });
      });
    });
  });

  describe('streaming', () => {
    it('should be possible to read from the stream', (done) => {
      const crawler = createCrawler(url);

      crawler.setFinder(new GenericLinkFinder());

      crawler.addRunner('agent', {
        getCompanionFiles: () => [],
        getRunnable: () => function xRunner() {
          window.callPhantom(null, 'X');
        },
      });

      const results = {};
      results[url] = {
        runners: {
          agent: {
            result: 'X',
          },
        },
      };
      results[`${url}#somehash`] = {
        runners: {
          agent: {
            result: 'X',
          },
        },
      };
      results[`${url}other.html`] = {
        runners: {
          agent: {
            result: 'X',
          },
        },
      };
      const stream = crawler.crawl(true);

      let streamed = '';
      stream.on('data', (data) => {
        streamed += data;
      });
      const endSpy = sinon.spy();
      stream.on('end', endSpy);
      stream.on('close', () => {
        endSpy.should.be.calledBefore(this);
        JSON.parse(streamed).should.deep.equal(results);
        done();
      });
    });

    it('should error if no URL was given', () => {
      expect(() => createCrawler().crawl(true)).to.throw(errors.InvalidUrlError);
    });

    it('should error if erroneous URL was given', () => {
      const errUrl = 'mailto:bla@bla';
      expect(() => createCrawler(errUrl).crawl(true)).to.throw(errors.InvalidUrlError);
    });
  });
});
