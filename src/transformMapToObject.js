/**
* Transforms a {Map} to an {Object} hash.
*
* @private
* @param {Map} map The map to transform
* @return {Object} The transformed key/value hash object.
*/
module.exports = (map) => {
    const result = {};
    map.forEach((value, key) => {
        result[key] = value;
    });
    return result;
};
