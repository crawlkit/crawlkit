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

describe('crawler', function main() {
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
            return crawler.crawl(genericLinkFinder).should.eventually.deep.equal({results});
        });
        it('a website and discover dynamic links', () => {
            const crawler = new CrawlKit(`${url}/other.html`, {
                timeout: 2000,
            });

            const results = {};
            results[`${url}/other.html`] = {};
            results[`${url}/ajax.html`] = {};

            return crawler.crawl(genericLinkFinder).should.eventually.deep.equal({results});
        });

        it('with multiple finders', () => {
            const crawler = new CrawlKit(url);

            const results1 = {};
            results1[`${url}/`] = {};
            results1[`${url}/#somehash`] = {};
            results1[`${url}/other.html`] = {};

            const results2 = {};
            results2[`${url}/`] = {};
            results2[`${url}/hidden.html`] = {};

            return Promise.all([
                crawler.crawl(genericLinkFinder),
                crawler.crawl(function hiddenOnly() {
                    return ['hidden.html'];
                }),
            ]).should.eventually.deep.equal([{results: results1}, {results: results2}]);
        });

        it('with an incorrect finder return value', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {};

            return crawler.crawl(function incorrectReturnFilter() {
                return 'notAnArray';
            }).should.eventually.deep.equal({results});
        });

        it('with an erroneous finder', () => {
            const crawler = new CrawlKit(url);

            const results = {};
            results[`${url}/`] = {};

            return crawler.crawl(function erroneusFinder() {
                throw new Error('Some arbitrary error');
            }).should.eventually.deep.equal({results});
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

            return crawler.crawl(genericLinkFinder).should.eventually.deep.equal({results});
        });
    });
});
