const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ message: err.message || 'Something broke!' });
};

module.exports = errorHandler;
