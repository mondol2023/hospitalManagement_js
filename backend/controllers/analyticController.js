const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Analytics = require('../models/Analytics');

const getStats = async (req, res, next) => {
  try {
    const totalPatients = await User.countDocuments({ role: 'patient' });
    const totalDoctors = await User.countDocuments({ role: 'doctor' });
    const appointmentsToday = await Appointment.countDocuments({
      date: { $gte: new Date().setHours(0,0,0,0) }
    });

    res.json({ totalPatients, totalDoctors, appointmentsToday });
  } catch (err) {
    next(err);
  }
};

const customAnalytics = async (req, res, next) => {
  try {
    const data = await Analytics.find(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, customAnalytics };
