const Notification = require('../models/Notification');
const { sendEmail } = require('./emailService');
const { sendSMS } = require('./smsService');

const notifyUser = async ({ userId, type, content, channels = [] }) => {
  const notification = await Notification.create({ userId, type, content });

  if (channels.includes('email')) {
    await sendEmail({ to: 'user@example.com', subject: 'Notification', html: content });
  }

  if (channels.includes('sms')) {
    await sendSMS('1234567890', content);
  }

  return notification;
};

module.exports = { notifyUser };
