# CrawlKit
[![Build status](https://img.shields.io/travis/crawlkit/crawlkit/master.svg)](https://travis-ci.org/crawlkit/crawlkit)
[![npm](https://img.shields.io/npm/v/crawlkit.svg)](https://www.npmjs.com/package/crawlkit)
[![npm](https://img.shields.io/npm/l/crawlkit.svg)]()
[![David](https://img.shields.io/david/crawlkit/crawlkit.svg)]()
[![node](https://img.shields.io/node/v/crawlkit.svg)]()
[![bitHound Overall Score](https://www.bithound.io/github/crawlkit/crawlkit/badges/score.svg)](https://www.bithound.io/github/crawlkit/crawlkit)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

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
    .then((results) => {
        console.log(JSON.stringify(results, true, 2));
    }, (err) => console.error(err));
```
Also, have a look at the [samples](https://github.com/crawlkit/crawlkit/tree/master/examples).

## API
See the [API docs](http://crawlkit.github.io/crawlkit/docs/).

## Debugging
CrawlKit uses [debug](https://github.com/visionmedia/debug) for debugging purposes. In short, you can add `DEBUG="*"` as an environment variable before starting your app to get all the logs. A more sane configuration is probably `DEBUG="*:info,*:error,-crawlkit:pool*"` if your page is big.

## Available runners
* [HTML Codesniffer runner](https://github.com/crawlkit/runner-htmlcs): Audit a website with the [HTML Codesniffer](https://github.com/squizlabs/HTML_CodeSniffer) to find accessibility defects.
* [Google Chrome Accessibility Developer Tools runner](https://github.com/crawlkit/runner-accessibility-developer-tools): Audit a website with the [Google Chrome Accessibility Developer Tools](https://github.com/GoogleChrome/accessibility-developer-tools) to find accessibility defects.
* [aXe runner](https://github.com/crawlkit/runner-axe): Audit a website with [aXe](https://github.com/dequelabs/axe-core).
* Yours? Create a PR to add it to this list here!
