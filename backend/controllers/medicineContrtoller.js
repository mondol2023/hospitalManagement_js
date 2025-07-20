const Medicine = require('../models/Medicine');

const addMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.create(req.body);
    res.status(201).json(medicine);
  } catch (err) {
    next(err);
  }
};

const getAllMedicines = async (req, res, next) => {
  try {
    const meds = await Medicine.find();
    res.json(meds);
  } catch (err) {
    next(err);
  }
};

const updateStock = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const med = await Medicine.findByIdAndUpdate(req.params.id, { quantity }, { new: true });
    res.json(med);
  } catch (err) {
    next(err);
  }
};

module.exports = { addMedicine, getAllMedicines, updateStock };
