module.exports = function genericAnchors() {
    var urls = Array.prototype.slice.call(document.querySelectorAll('a')).map(function extractHref(a) {
        return a.getAttribute('href');
    });
    window.callPhantom(null, urls);
};
