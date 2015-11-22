# CrawlKit [![Build Status](https://travis-ci.org/crawlkit/crawlkit.svg)](https://travis-ci.org/crawlkit/crawlkit)

A crawler based on Phantom. Allows discovery of dynamic content and supports custom scrapers. For all your ajaxy crawling & scraping needs.

* Supports parallel crawling/scraping via Phantom pooling.
* Supports custom-defined link discovery.
* Supports custom-defined runners (scrape, test, validate, etc.)

## Usage
```javascript
const CrawlKit = require('crawlkit');
const anchorFinder = require('crawlkit/finders/genericAnchors');

const crawler = new CrawlKit('http://your/page');
crawler.finder = anchorFinder;
crawler.crawl()
    .then((data) => {
        console.log(data.results);
    });
```

## API
An instance of CrawlKit has the following properties/methods:

* `.url`: `String` the URL where the crawling/scraping is supposed to start. This is automatically set from the `CrawlKit` constructor, but can be changed afterwards.
* `.finder`: `Function` allows you to set a method for link discovery that gets called on a page. See an example in `finders/genericAnchors.js`.
* `.urlFilter`: `Function` allows you to set a method for filtering discovered URLs. For an example see `examples/advanced.js`.
* `.addRunner(runnerId, runnerFn)`: `void` allows you to add a runner that is executed on each crawled page. For an example see `examples/simple.js`.
* `.timeout`: `int` (ms) allows you to set the timeout for the finder and runners. The timeout starts fresh for each runner. Default is `10000` (10 seconds).
* `.concurrency`: `int` allows you to define how many Phantom browsers are used in parallel. Defaults to `1`.
* `.defaultAbsoluteTo`: `String` this is where a URL gets rewritten to if it is absolute, but doesn't have a protocol. Defaults to `http://`.
* `.phantomParameters`: `Object` map of parameters to pass to PhantomJS. You can use this for example to ignore SSL errors. For a list of parameters, please refer to the [PhantomJS documentation](http://phantomjs.org/api/command-line.html).
* `.phantomPageSettings`: `Object` map of settings to pass to an opened page. You can use this for example for Basic Authentication. For a list of options, please refer to the [PhantomJS documentation](http://phantomjs.org/api/webpage/property/settings.html).
