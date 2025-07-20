const Appointment = require('../models/Appointment');
const Bed = require('../models/Bed');

const getHospitalStats = async () => {
  const appointments = await Appointment.countDocuments();
  const availableBeds = await Bed.countDocuments({ status: 'available' });

  return {
    totalAppointments: appointments,
    availableBeds,
  };
};

module.exports = { getHospitalStats };
