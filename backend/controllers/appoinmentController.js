const appointment = require('../models/Appointment');

const createAppointment = async (req, res, next) => {
    try {
        const appointment = await Appointment.create(req.body);
        res.status(201).json(appointment);
    }
    catch (err){
        next(err);
    }
};

const getAppointment = async (req, res, next) => {
    try {
        const appointment = await Appointment.find().populate('patient', '-password').populate('doctor', '-password');
        res.status(200).json(appointment);
    }
    catch (err){
        next(err);
    }
};

const updateAppointment = async (req, res, next) => {
    try {
        const updated = await Appointment.findByIdAndUpdate(req.params.id, req.body,{status} ,{ new: true });
        res.status(200).json(updated);
    }
    catch (err){
        next(err);
    }
};

module.exports = {
    createAppointment,
    getAppointment,
    updateAppointment
}