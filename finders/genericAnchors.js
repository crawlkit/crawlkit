module.exports = function genericAnchors(delay) {
    delay = Math.max(0, parseInt(delay, 10) || 0);

    window.setTimeout(function findAnchors() {
        var urls = Array.prototype.slice.call(document.querySelectorAll('a')).map(function extractHref(a) {
            return a.getAttribute('href');
        });
        window.callPhantom(null, urls);
    }, delay);
};
