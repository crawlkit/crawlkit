module.exports = (scope, fn) => {
    return (done) => {
        if (scope.isStopped()) {
            return done();
        }
        fn(done);
    };
};
