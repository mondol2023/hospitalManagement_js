const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema ({
    reportedBy : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User'
    },
    type : {
        type : String, 
        required : true
    },
    description : {
        type : String
    },
    resolved : {
        type : boolean ,
        default : false
    }
} , {timestamps : true });

module.exports = mongoose.model ('Emergency', emergencySchema);