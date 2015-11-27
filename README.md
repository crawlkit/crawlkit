# CrawlKit
[![Build status](https://img.shields.io/travis/crawlkit/crawlkit/master.svg)](https://travis-ci.org/crawlkit/crawlkit)
[![npm](https://img.shields.io/npm/v/crawlkit.svg)](https://www.npmjs.com/package/crawlkit)
[![npm](https://img.shields.io/npm/l/crawlkit.svg)]()
[![David](https://img.shields.io/david/crawlkit/crawlkit.svg)]()
[![node](https://img.shields.io/node/v/crawlkit.svg)]()

A crawler based on PhantomJS. Allows discovery of dynamic content and supports custom scrapers. For all your ajaxy crawling & scraping needs.

* Parallel crawling/scraping via Phantom pooling.
* Custom-defined link discovery.
* Custom-defined runners (scrape, test, validate, etc.)
* Can follow redirects (and because it's based on PhantomJS, JavaScript redirects will be followed as well as `<meta>` redirects.)
* Streaming
* Resilient to PhantomJS crashes
* Ignores page errors

## Install
```console
npm install crawlkit --save
```

## Usage
```javascript
const CrawlKit = require('crawlkit');
const anchorFinder = require('crawlkit/finders/genericAnchors');

const crawler = new CrawlKit('http://your/page');
crawler.setFinder({
    getRunnable: () => anchorFinder
});
crawler.crawl()
    .then((data) => {
        console.log(JSON.stringify(data.results, true, 2));
    });
```

## API
See the [API docs](http://crawlkit.github.io/crawlkit/docs/crawlkit/1.3.0/).

## Debugging
CrawlKit uses [debug](https://github.com/visionmedia/debug) for debugging purposes. In short, you can add `DEBUG="*"` as an environment variable before starting your app to get all the logs. A more sane configuration is probably `DEBUG="*:info,*:error,-crawlkit:pool*"` if your page is big.

## Available runners
* [HTML Codesniffer runner](https://github.com/crawlkit/runner-htmlcs): Audit a website with the [HTML Codesniffer](https://github.com/squizlabs/HTML_CodeSniffer) to find accessibility defects.
* [Google Chrome Accessibility Developer Tools runner](https://github.com/crawlkit/runner-accessibility-developer-tools): Audit a website with the [Google Chrome Accessibility Developer Tools](https://github.com/GoogleChrome/accessibility-developer-tools) to find accessibility defects.
* Yours? Create a PR to add it to this list here!
