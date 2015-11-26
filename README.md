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

## Install
```console
npm install crawlkit --save
```

## Usage
```javascript
const CrawlKit = require('crawlkit');
const anchorFinder = require('crawlkit/finders/genericAnchors');

const crawler = new CrawlKit('http://your/page');
crawler.finder = anchorFinder;
crawler.crawl()
    .then((data) => {
        console.log(JSON.stringify(data.results, true, 2));
    });
```

## API
An instance of CrawlKit has the following properties/methods:

* `.url`: `String` the URL where the crawling/scraping is supposed to start. This is automatically set from the `CrawlKit` constructor, but can be changed afterwards.
* `.finder`: `Function` allows you to set a method for link discovery that gets called on a page. See an example in `finders/genericAnchors.js`.
* `.crawl(shouldStream)`: If `shouldStream` is false (default), it returns a Promise object that resolves to the result. If `shouldStream` is true, it returns a JSON stream of the results.
* `.urlFilter`: `Function` allows you to set a method for filtering and rewriting discovered URLs. The first parameter is the URL about to be added. The second parameter is the URL where this URL was discovered. Return `false` to discard the URL. Any other return value (as long as it is a valid URL) will be used instead. If you return a relative URL, it will be rewritten absolute to the URL where it was found. For an example see `examples/advanced.js`.
* `.addRunner(runnerId, runnerInstance, [parameters...])`: `void` allows you to add a runner that is executed on each crawled page. A runner instance has to have a `getCompanionFiles` method returning an array of (local) file paths or a Promise resolving to one and a `getRunnable` method returning a method to run in the context of the webpage. As a third argument optionally one or more parameters can be passed. For an example see `examples/simple.js`. For an example using parameters, see `examples/advanced.js`.
* `.timeout`: `int` (ms) allows you to set the timeout for the finder and runners. The timeout starts fresh for each runner. Default is `10000` (10 seconds).
* `.concurrency`: `int` allows you to define how many Phantom browsers are used in parallel. Defaults to `1`.
* `.defaultAbsoluteTo`: `String` this is where a URL gets rewritten to if it is absolute, but doesn't have a protocol. Defaults to `http://`.
* `.phantomParameters`: `Object` map of parameters to pass to PhantomJS. You can use this for example to ignore SSL errors. For a list of parameters, please refer to the [PhantomJS documentation](http://phantomjs.org/api/command-line.html).
* `.phantomPageSettings`: `Object` map of settings to pass to an opened page. You can use this for example for Basic Authentication. For a list of options, please refer to the [PhantomJS documentation](http://phantomjs.org/api/webpage/property/settings.html).
* `.followRedirects`: `boolean` whether to follow redirects or not. When following redirects, the original page is not processed. Defaults to `false`.
* `.browserCookies`: `Array` Cookies to set within PhantomJS. Each entry in the array is supposed to be an object [following the PhantomJS spec](http://phantomjs.org/api/webpage/method/add-cookie.html). Empty by default.

## Debugging
CrawlKit uses [debug](https://github.com/visionmedia/debug) for debugging purposes. In short, you can add `DEBUG="*"` as an environment variable before starting your app to get all the logs. A more sane configuration is probably `DEBUG="crawlkit:info,crawlkit*:error"` if your page is big.

## Available runners
* [HTML Codesniffer runner](https://github.com/crawlkit/runner-htmlcs): Audit a website with the [HTML Codesniffer](https://github.com/squizlabs/HTML_CodeSniffer) to find accessibility defects.
* [Google Chrome Accessibility Developer Tools runner](https://github.com/crawlkit/runner-accessibility-developer-tools): Audit a website with the [Google Chrome Accessibility Developer Tools](https://github.com/GoogleChrome/accessibility-developer-tools) to find accessibility defects.
* Yours? Create a PR to add it to this list here!
