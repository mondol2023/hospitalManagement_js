const Notification = require('../models/Notification');

const createNotification = async (req, res, next) => {
  try {
    const notification = await Notification.create(req.body);
    res.status(201).json(notification);
  } catch (err) {
    next(err);
  }
};

const getUserNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notify = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    res.json(notify);
  } catch (err) {
    next(err);
  }
};

module.exports = { createNotification, getUserNotifications, markAsRead };
