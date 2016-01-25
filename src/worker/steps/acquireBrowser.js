module.exports = (scope, logger, pool) => (done) => {
    logger.debug('acquiring phantom from pool');
    pool.acquire((err, browser) => {
        if (err) {
            return done(err);
        }
        scope.setBrowser(browser);
        logger.debug(`Acquired phantom from pool.`);
        done();
    });
};
