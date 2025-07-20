const Emergency = require('../models/Emergency');

const createAlert = async (req, res, next) => {
  try {
    const alert = await Emergency.create(req.body);
    res.status(201).json(alert);
  } catch (err) {
    next(err);
  }
};

const getAllAlerts = async (req, res, next) => {
  try {
    const alerts = await Emergency.find().sort({ createdAt: -1 });
    res.json(alerts);
  } catch (err) {
    next(err);
  }
};

const updateAlertStatus = async (req, res, next) => {
  try {
    const alert = await Emergency.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(alert);
  } catch (err) {
    next(err);
  }
};

module.exports = { createAlert, getAllAlerts, updateAlertStatus };
