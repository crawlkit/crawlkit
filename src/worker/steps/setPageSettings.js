'use strict'; // eslint-disable-line
const path = require('path');
const pkg = require(path.join(__dirname, '..', '..', '..', 'package.json'));
const phantomjs = require('phantomjs');

module.exports = (scope, logger, phantomPageSettings, followRedirects) => {
    return (done) => {
        logger.debug('Setting page settings');
        const settingsToSet = Object.assign({
            'settings.userAgent': `CrawlKit/${pkg.version} (PhantomJS/${phantomjs.version})`,
        }, phantomPageSettings);

        if (!followRedirects) {
            // TODO: fix - enabling the next line currently stalls PhantomJS
            // but it is needed to prevent redirects when redirects are not
            // supposed to be followed

            // settingsToSet.navigationLocked = true;
        }

        Promise.all(Object.keys(settingsToSet).map((key) => {
            return new Promise((success, reject) => {
                logger.debug(`Attempting to set setting ${key} => ${JSON.stringify(settingsToSet[key])}`);
                scope.page.set(key, settingsToSet[key], (settingErr) => {
                    if (settingErr) {
                        logger.error(`Setting ${key} failed`);
                        return reject(settingErr);
                    }
                    logger.debug(`Successfully set setting ${key}`);
                    success();
                });
            });
        })).then(() => {
            logger.debug('All page settings set');
            done();
        }, done);
    };
};
