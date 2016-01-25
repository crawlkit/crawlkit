module.exports = (scope, fn) => (done) => {
  if (scope.isStopped()) {
    return done();
  }
  fn(done);
};
