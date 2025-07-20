const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        required: true,
        enum: ['admin', 'patient', 'doctor', 'nurse', 'receptionist', 'manager', 'pharmacy', 'support', 'maintenance'],
        default: 'patient'
    },
    phone : {
        type : String
    },
    address : {
        type : String
    },
    profilePic : {
        type : String
    },
    isActive : {
        type : Boolean,
        default : true
    },
    outhProvider : {
        type : String,
        enum : [ 'google', 'facebook', 'local'],
        default : 'local'
    }  
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);