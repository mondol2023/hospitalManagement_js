const mongoose = require('mongoose');

const bedSchema = new mongoose.Schema({
    patient : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    bedNumber : {
        type : Number,
        required : true
    },
    isOccupied : {
        type : Boolean,
        default : false
    },
    ward :{
        type : String,
        required : true
    }
}, {timestamps : true});

module.exports = mongoose.model ('Bed', bedSchema);