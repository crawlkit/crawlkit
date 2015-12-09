'use strict'; // eslint-disable-line
const defineError = require('define-error');

module.exports.TransformationError = defineError('TransformationError');
module.exports.StatusError = defineError('StatusError', function statusError(statusText, code) {
    this.code = code;
});
