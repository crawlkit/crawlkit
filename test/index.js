'use strict'; // eslint-disable-line
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const httpServer = require('http-server');
const path = require('path');
const freeport = require('freeport');
const pkg = require(path.join(__dirname, '..', 'package.json'));
const CrawlKit = require(path.join(__dirname, '..', pkg.main));
const genericLinkFinder = require('../finders/genericAnchors.js');

chai.should();
chai.use(chaiAsPromised);
chai.use(sinonChai);

describe('CrawlKit', function main() {
    this.timeout(5 * 60 * 1000); // crawling can take a while
    let server;
    let url;
    let port;
    const host = '0.0.0.0';

    before((done) => {
        freeport((err, p) => {
            if (err) {
                throw err;
            }
            port = p;
            server = httpServer.createServer({
                root: path.join(__dirname, 'fixtures', 'website'),
            });
            server.listen(port);
            url = `http://${host}:${port}`;
            done();
        });
    });

    after(() => {
        server.close();
    });


    describe('should be able to crawl', () => {
        it('a website', () => {
            const crawler = new CrawlKit(url);
            const results = {};
            results[`${url}/`] = {};
            return crawler.crawl().should.eventually.deep.equal({results});
        });

        describe('with a finder', () => {
            it('that is custom', () => {
                const crawler = new CrawlKit(url);

                const results = {};
                results[`${url}/`] = {};
                results[`${url}/#somehash`] = {};
                results[`${url}/other.html`] = {};

                crawler.finder = genericLinkFinder;
                return crawler.crawl().should.eventually.deep.equal({results});
            });

            it('that is async', () => {
                const crawler = new CrawlKit(`${url}/other.html`);

                const results = {};
                results[`${url}/other.html`] = {};
                results[`${url}/ajax.html`] = {};


                crawler.finder = function delayedFinder() {
                    /*eslint-disable */
                    window.setTimeout(function findLinks() {
                        var urls = Array.prototype.slice.call(document.querySelectorAll('a')).map(function extractHref(a) {
                            return a.getAttribute('href');
                        });
                        window.callPhantom(null, urls);
                    }, 2000);
                    /*eslint-enable */
                };

                return crawler.crawl().should.eventually.deep.equal({results});
            });

            it('that has an incorrect return value', () => {
                const crawler = new CrawlKit(url);

                const results = {};
                results[`${url}/`] = {};

                crawler.finder = function incorrectReturnFilter() {
                    window.callPhantom(null, 'notAnArray');
                };
                return crawler.crawl().should.eventually.deep.equal({results});
            });

            it('that doesn\'t return URLs', () => {
                const crawler = new CrawlKit(url);

                const results = {};
                results[`${url}/`] = {};
                results[`${url}/other.html`] = {};
                results[`${url}/hidden.html`] = {};

                crawler.finder = function incorrectReturnFilter() {
                    window.callPhantom(null, [
                        'other.html',
                        null,
                        'hidden.html',
                    ]);
                };
                return crawler.crawl().should.eventually.deep.equal({results});
            });

            it('that is erroneous', () => {
                const crawler = new CrawlKit(url);

                const results = {};
                results[`${url}/`] = {
                    error: 'Some arbitrary error',
                };
                crawler.finder = function erroneusFinder() {
                    window.callPhantom('Some arbitrary error', null);
                };
                return crawler.crawl().should.eventually.deep.equal({results});
            });

            it('that throws an exception', () => {
                const crawler = new CrawlKit(url);

                const results = {};
                results[`${url}/`] = {
                    error: 'Error: Some thrown error',
                };
                crawler.finder = function erroneusFinder() {
                    throw new Error('Some thrown error');
                };
                return crawler.crawl().should.eventually.deep.equal({results});
            });

            it('that never returns', () => {
                const crawler = new CrawlKit(url);

                const results = {};
                results[`${url}/`] = {
                    error: 'Finder timed out after 1000ms.',
                };
                crawler.timeout = 1000;
                crawler.finder = function neverReturningFilter() {};
                return crawler.crawl().should.eventually.deep.equal({results});
            });
        });

        it('and filter the results', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {};
            results[`${url}/other.html`] = {};

            crawler.finder = genericLinkFinder;

            const spy = sinon.spy((u) => u.indexOf('somehash') === -1);
            crawler.urlFilter = spy;

            return crawler.crawl().then((result) => {
                spy.callCount.should.equal(2);
                return result.results;
            }).should.eventually.deep.equal(results);
        });
    });

    it('should fall back to http', () => {
        const crawler = new CrawlKit(`//${host}:${port}`);
        return crawler.crawl().should.be.fulfilled;
    });

    it('should not fail on dead links', () => {
        const crawler = new CrawlKit(`${url}/deadlinks.html`);

        const results = {};
        results[`${url}/deadlinks.html`] = {};
        results[`${url}/nonexistent.html`] = {
            error: `Failed to open ${url}/nonexistent.html`,
        };
        results[`${url}/404.html`] = {
            error: `Failed to open ${url}/404.html`,
        };
        crawler.finder = genericLinkFinder;
        return crawler.crawl().should.eventually.deep.equal({results});
    });

    describe('runners', () => {
        it('should be possible to use', () => {
            const crawler = new CrawlKit(url);

            crawler.addRunner('a', function a() { window.callPhantom(null, 'a'); });
            crawler.addRunner('b', function b() { window.callPhantom('b', null); });

            const results = {};
            results[`${url}/`] = {
                runners: {
                    a: {
                        result: 'a',
                    },
                    b: {
                        error: 'b',
                    },
                },
            };
            return crawler.crawl().should.eventually.deep.equal({results});
        });

        it('should be able to run async', () => {
            const crawler = new CrawlKit(url);
            crawler.addRunner('async', function delayedRunner() {
                window.setTimeout(function delayedCallback() {
                    window.callPhantom(null, 'success');
                }, 2000);
            });

            const results = {};
            results[`${url}/`] = {
                runners: {
                    async: {
                        result: 'success',
                    },
                },
            };
            return crawler.crawl().should.eventually.deep.equal({results});
        });

        it('should time out', () => {
            const crawler = new CrawlKit(url);
            crawler.timeout = 1000;
            crawler.addRunner('x', function noop() {});

            const results = {};
            results[`${url}/`] = {
                runners: {
                    x: {
                        error: `Runner 'x' timed out after 1000ms.`,
                    },
                },
            };
            return crawler.crawl().should.eventually.deep.equal({results});
        });
    });

    describe('settings', () => {
        it('should be possible to set a page setting', () => {
            const crawler = new CrawlKit(url);
            crawler.phantomPageSettings = {
                userAgent: 'Mickey Mouse',
            };
            crawler.addRunner('agent', function a() { window.callPhantom(null, navigator.userAgent); });

            const results = {};
            results[`${url}/`] = {
                runners: {
                    agent: {
                        result: 'Mickey Mouse',
                    },
                },
            };
            return crawler.crawl().should.eventually.deep.equal({results});
        });
    });
});
