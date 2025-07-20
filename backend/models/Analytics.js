const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
    metric : {
        type : String,
        required : true
    },
    value : Number,
    date : {
        type : Date ,
        default : Date.now
    }
});

module.exports = mongoose.model ('Analytics', analyticsSchema)