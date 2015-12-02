module.exports = (scope, pool, logger) => {
    return (done) => {
        pool.acquire((err, browser) => {
            scope.browser = browser;
            if (err) {
                return done(err, scope);
            }
            logger.debug(`Acquired phantom from pool.`);
            done(null, scope);
        });
    };
};
