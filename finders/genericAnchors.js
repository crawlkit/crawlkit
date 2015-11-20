module.exports = function genericAnchors() {
    return Array.prototype.slice.call(document.querySelectorAll('a')).map(function extractHref(a) {
        return a.getAttribute('href');
    });
};
