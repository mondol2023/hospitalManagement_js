const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    employeeId: {
        type: String,
        required: true
    },
    specialization: {
        type: String,
        required: true
    },
    qualifications: {
        type: String,
        required: true
    },
    experienceInYears : Number,
    availableDays : [String],
    timeSlots : [{
        start : String,
        end : String
    }],
}, {timestamps : true});

module.exports = mongoose.model('Doctor', doctorSchema);