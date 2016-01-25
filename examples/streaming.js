'use strict'; // eslint-disable-line
const CrawlKit = require('crawlkit');

const baseURL = 'https://www.google.com';
const crawler = new CrawlKit(baseURL);

crawler.addRunner('title', {
    getCompanionFiles: () => [],
    getRunnable: () => function extractTitle() {
        window.callPhantom(null, document.title);
    },
});

const stream = crawler.crawl(true);
stream.on('end', () => {
    /* eslint-disable no-console */
    console.log('done!');
});
stream.pipe(process.stdout);
