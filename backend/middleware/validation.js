const { body, validationResult } = require('express-validator');

const validate = (type) => {
  let rules = [];

  if (type === 'register') {
    rules = [
      body('name').notEmpty(),
      body('email').isEmail(),
      body('password').isLength({ min: 6 })
    ];
  }

  if (type === 'login') {
    rules = [
      body('email').isEmail(),
      body('password').notEmpty()
    ];
  }

  return [
    ...rules,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      next();
    }
  ];
};

module.exports = validate;
