const mongoose = require('mongoose');

const appoinmentSchema = new mongoose.Schema({
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
    date : {
        type : Date,
        required : true
    },
    time : {
        type : String,
        required : true
    },
    status : {
        type : String,
        enum : ['pending', 'approved', 'rejected'],
        default : 'pending'
    },
    notes : String
}, {timestamps : true});

module.exports = mongoose.model ('Appoinment', appoinmentSchema);