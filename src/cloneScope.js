'use strict'; // eslint-disable-line

const objectAssign = require('object-assign');

module.exports = (scope) => {
    const clone = objectAssign({}, scope);
    delete clone.result.error;
    delete clone.stop;
    return clone;
};
