module.exports = (scope, fn) => (done) => {
  if (scope.isStopped()) {
    done();
    return;
  }
  fn(done);
};
