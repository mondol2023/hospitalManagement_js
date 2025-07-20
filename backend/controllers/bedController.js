const Bed = require('../models/Bed');

const addBed = async (req, res, next) => {
  try {
    const bed = await Bed.create(req.body);
    res.status(201).json(bed);
  } catch (err) {
    next(err);
  }
};

const getAllBeds = async (req, res, next) => {
  try {
    const beds = await Bed.find();
    res.json(beds);
  } catch (err) {
    next(err);
  }
};

const updateBedStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await Bed.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

module.exports = { addBed, getAllBeds, updateBedStatus };
