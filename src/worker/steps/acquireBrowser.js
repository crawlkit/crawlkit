module.exports = (scope, logger, pool) => {
    return (done) => {
        logger.debug('acquiring phantom from pool');
        pool.acquire((err, browser) => {
            if (err) {
                return done(err);
            }
            scope.browser = browser;
            logger.debug(`Acquired phantom from pool.`);
            done();
        });
    };
};
