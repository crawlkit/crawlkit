module.exports = (scope, fn) => {
    return (done) => {
        if (scope.stop) {
            return done();
        }
        fn(done);
    };
};
