# CrawlKit

A crawler based on Phantom. Allows discovery of dynamic content and supports custom scrapers. For all your ajaxy crawling needs.

* Supports parallel crawling/scraping via Phantom pooling.
* Supports custom-defined link discovery.
* Supports custom-defined runners (scrape, test, validate, etc.)

## Usage
```javascript
const CrawlKit = require('crawlkit');
const anchorFinder = require('crawlkit/finders/genericAnchors');
const crawler = new CrawlKit('http://your/page');

crawler.crawl(anchorFinder)
    .then((data) => {
        console.log(data.results);
    });
```
