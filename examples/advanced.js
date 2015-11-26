'use strict';
const CrawlKit = require('../');
const genericAnchors = require('../finders/genericAnchors');
const urijs = require('urijs');

const baseURL = 'http://www.feth.com';

class SameDomainLinkFinder {
    getRunnable() {
        // the function returned here runs within the webpage. No closures, etc.
        return genericAnchors;
    }

    urlFilter() {
        if (urijs(url).domain() !== urijs(baseURL).domain()) {
            // not same domain - discard URL
            return false;
        }
        return url;
    }
}

class TitleRunner {
    getCompanionFiles() {
        return Promise.resolve([]);
    }

    getRunnable() {
        // the function returned here runs within the webpage. No closures, etc.
        return function extractTitle(delay) {
            window.setTimeout(function delayedWork() {
                window.callPhantom(null, document.title);
            }, delay);
        };
    }
}


const crawler = new CrawlKit(baseURL);
crawler.setFinder(new SameDomainLinkFinder());
crawler.addRunner('title', new TitleRunner(), 1000);

crawler.crawl().then((results) => {
    console.log(JSON.stringify(results, true, 2));
});
