/**
 * A method that extracts all href's from any anchor on the page.
 * Can be used as the return value of {@link Finder#getRunnable}.
 * The delay can be set through the parameters via {@link CrawlKit#setFinder}.
 *
 * @module finders.genericAnchors
 * @param {integer} [delay=0] The delay after which the function searches for anchors.
 */
function genericAnchors(delay) {
  /* eslint-disable no-var */
  var timeoutDelay = Math.max(0, parseInt(delay, 10) || 0);

  function extractHref(a) {
    return a.getAttribute('href');
  }

  window.setTimeout(function findAnchors() { // eslint-disable-line prefer-arrow-callback
    var anchors = document.querySelectorAll('a');
    var urls = Array.prototype.slice.call(anchors).map(extractHref);
    window.callPhantom(null, urls);
  }, timeoutDelay);
}

module.exports = genericAnchors;
