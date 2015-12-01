'use strict'; // eslint-disable-line
const CrawlKit = require('crawlkit');

const baseURL = 'https://www.google.com';
const crawler = new CrawlKit(baseURL);

crawler.addRunner('title', {
    getCompanionFiles: () => [],
    getRunnable: () => {
        return function extractTitle() {
            window.callPhantom(null, document.title);
        };
    },
});

crawler.crawl(true).pipe(process.stdout);
