'use strict';
const CrawlKit = require('../');
const genericAnchors = require('../finders/genericAnchors');
const urijs = require('urijs');

const baseURL = 'http://www.feth.com';
const crawler = new CrawlKit(baseURL);

crawler.finder = genericAnchors;
crawler.urlFilter = function onlySameDomain(url) {
    if (urijs(url).domain() !== urijs(baseURL).domain()) {
        // discard URL
        return false;
    }
    return url;
};

class TitleRunner {
    getCompanionFiles() {
        return [];
    }

    getRunnable() {
        return function extractTitle() {
            window.callPhantom(null, document.title);
        };
    }
}

crawler.addRunner('title', new TitleRunner());

crawler.crawl().then((results) => {
    console.log(JSON.stringify(results, true, 2));
});
