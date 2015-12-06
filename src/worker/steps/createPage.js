module.exports = (scope, logger) => {
    return (done) => {
        logger.debug('Creating page.');
        scope.browser.createPage((err, page) => {
            if (err) {
                return done(err);
            }
            logger.debug(`Page created.`);
            scope.page = page;
            done();
        });
    };
};
