function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  return res.status(500).send('Internal Server Error');
}

module.exports = {
  errorHandler,
};
