const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    user : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    age : {
        type : Number,
        required : true
    },
    gender : {
        type : String,
        enum : ['male', 'female'],
        required : true
    },
    address : {
        type : String
    },
    bloodGroup : {
        type : String,
        enum : ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    emergencyContact : {
        name : {
            type : String,
            required : true
        },
        relationship : {
            type : String,
            required : true
        },
        phone : {
            type : String,
            required : true
        },
        email : {
            type : String
        }
    },
    doctor : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User'
    },
    bed : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Bed'
    },
    medicalHistory : String
}, {timestamps : true});

module.exports = mongoose.model ('Patient', patientSchema);
