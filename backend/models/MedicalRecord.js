const mongoose = require ('mongoose');

const medicalRecordSchema = new mongoose.Schema({
    patient : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Patient',
        required : true
    },
    doctor : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    notes : String,
    visitDate : Date,
    diagnosis : String,
    prescriptions : String,
    attachment : String
}, {timestamps : true});

module.exports = mongoose.model ('MedicalRecord', medicalRecordSchema);