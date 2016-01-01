'use strict'; // eslint-disable-line
const defineError = require('define-error');

module.exports.TransformationError = defineError('TransformationError');

module.exports.StatusError = defineError('StatusError', function statusError(statusText, code) {
    this.code = code;
});

module.exports.RedirectError = defineError('RedirectError', function redirectError(statusText, targetUrl) {
    this.targetUrl = targetUrl;
});

module.exports.InvalidUrlError = defineError('InvalidUrlError', function urlError(statusText, url) {
    this.url = url;
});
