'use strict'; // eslint-disable-line
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const httpServer = require('http-server');
const path = require('path');
const freeport = require('freeport');
const pkg = require(path.join(__dirname, '..', 'package.json'));
const CrawlKit = require(path.join(__dirname, '..', pkg.main));
const genericLinkFinder = require('../finders/genericAnchors.js');

chai.should();
chai.use(chaiAsPromised);

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

        it('a website with a custom finder', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {};
            results[`${url}/#somehash`] = {};
            results[`${url}/other.html`] = {};

            crawler.finder = genericLinkFinder;
            return crawler.crawl().should.eventually.deep.equal({results});
        });
        it('a website and discover dynamic links', () => {
            const crawler = new CrawlKit(`${url}/other.html`, {
                timeout: 2000,
            });

            const results = {};
            results[`${url}/other.html`] = {};
            results[`${url}/ajax.html`] = {};

            crawler.finder = genericLinkFinder;
            return crawler.crawl().should.eventually.deep.equal({results});
        });

        it('with an incorrect finder return value', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {};

            crawler.finder = function incorrectReturnFilter() {
                window.callPhantom(null, 'notAnArray');
            };
            return crawler.crawl().should.eventually.deep.equal({results});
        });

        it('with an erroneous finder', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {
                error: {
                    message: 'Some arbitrary error',
                },
            };
            crawler.finder = function erroneusFinder() {
                window.callPhantom(new Error('Some arbitrary error'), null);
            };
            return crawler.crawl().should.eventually.deep.equal({results});
        });

        it('with a finder never returning', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {};
            crawler.finder = function neverReturningFilter() {};
            return crawler.crawl().should.eventually.deep.equal({results});
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
            const runners = {
                a: function a() { window.callPhantom(null, 'a'); },
                b: function b() { window.callPhantom('b', null); },
            };

            const crawler = new CrawlKit(url);

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
            return crawler.crawl(runners).should.eventually.deep.equal({results});
        });
    });
});
