module.exports = (scope, logger) => {
    return (done) => {
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
