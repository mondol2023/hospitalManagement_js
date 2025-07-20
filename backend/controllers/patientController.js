const User = require("../models/Users");
const patient = require("../models/Patient");

const createPatient = async (req, res, next) => {
    try {
        const user = await User.create(req.body.user);
        const patient = await Patient.create({...req.body.patient, user: user._id});
        res.status(201).json(patient);
    } catch (error) {
        next(error);
    }
};
const getAllPatients = async (req, res, next) => {
    try {
        const patients = await Patient.find().populate('user', '-password');
        res.status(200).json(patients);
    } catch (error) {
        next(error);
    }
};

const getPatientById = async (req, res, next) => {
    try {
        const patient = await Patient.findById(req.params.id).populate('user', '-password');
        if (!patient) {
            return res.status(404).json({ message: 'Patient not found' });
        }
        res.status(200).json(patient);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createPatient,
    getAllPatients,
    getPatientById,
};