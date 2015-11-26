# Link discovery

This directory contains modules for link discovery on a webpage.
Please bear in mind that any finder can only use features available on the target webpage and target PhantomJS. E.g. all es6 features used in the rest of the CrawlKit package are not applicable here.
Also bear in mind that anything passed from outside a finder function (e.g. closures) won't work.

An example of a simple method returned by `getRunnable` of a finder would be:

```javascript
function firstLinkFinder() {
    var links = document.getElementsByTagName('a');
    window.callPhantom(null, links.length ? [links[0].href] : []);
}
```

Finders can work asynchronously - whenever you are finished discovering links, call `window.callPhantom` with `([err, [urls]])`. Where the method expects the `err` parameter to be an arbitrary error object (or null in case there was no error) and the `urls` parameter to be an array.
