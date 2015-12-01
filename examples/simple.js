'use strict'; // eslint-disable-line
const CrawlKit = require('crawlkit');

const baseURL = 'https://www.google.com';
const crawler = new CrawlKit(baseURL);

crawler.addRunner('title', {
    getCompanionFiles: () => [],
    getRunnable: () => function extractTitle() { window.callPhantom(null, document.title); },
});

/* eslint-disable no-console */
crawler.crawl()
    .then((results) => {
        console.log(JSON.stringify(results, true, 2));
    }, (err) => console.error(err));
