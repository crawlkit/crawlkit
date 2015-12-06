module.exports = (scope, logger, pool) => {
    return (done) => {
        logger.debug('acquiring phantom from pool'):
        pool.acquire((err, browser) => {
            scope.browser = browser;
            if (err) {
                return done(err);
            }
            logger.debug(`Acquired phantom from pool.`);
            done();
        });
    };
};
