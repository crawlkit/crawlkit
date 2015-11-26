var CrawlKit = require('crawlkit');

var baseURL = 'https://www.google.com';
var crawler = new CrawlKit(baseURL);

crawler.addRunner('title', {
    getCompanionFiles: function() {
        return [];
    },
    getRunnable: function() {
        return function extractTitle() {
            window.callPhantom(null, document.title);
        };
    }
});

crawler.crawl().then(function(results) {
    console.log(JSON.stringify(results, true, 2));
});
