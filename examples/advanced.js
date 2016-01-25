'use strict'; // eslint-disable-line
const CrawlKit = require('crawlkit');
const genericAnchors = require('crawlkit/finders/genericAnchors');
const urijs = require('urijs');

const baseURL = 'http://www.feth.com';

class SameDomainLinkFinder {
    getRunnable() {
        // the function returned here runs within the webpage. No closures, etc.
        return genericAnchors;
    }

    urlFilter(url) {
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
            window.setTimeout(function delayedWork() {  // eslint-disable-line prefer-arrow-callback
                window.callPhantom(null, document.title);
            }, delay);
        };
    }
}


const crawler = new CrawlKit(baseURL);
crawler.setFinder(new SameDomainLinkFinder());
crawler.addRunner('title', new TitleRunner(), 1000);

/* eslint-disable no-console */
crawler.crawl()
    .then((results) => {
        console.log(JSON.stringify(results, true, 2));
    }, (err) => console.error(err));
