'use strict'; // eslint-disable-line
const defineError = require('define-error');

module.exports.TransformationError = defineError('TransformationError');

function statusError(statusText, code) {
  this.code = code;
}
module.exports.StatusError = defineError('StatusError', statusError);

function redirectError(statusText, targetUrl) {
  this.targetUrl = targetUrl;
}
module.exports.RedirectError = defineError('RedirectError', redirectError);

function urlError(statusText, url) {
  this.url = url;
}
module.exports.InvalidUrlError = defineError('InvalidUrlError', urlError);

module.exports.AlreadySetError = defineError('AlreadySetError');
