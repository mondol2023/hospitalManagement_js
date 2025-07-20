const mongoose = require('mongoose');

const billSchema = new mongoose.Schema ({
    patient : {
        type :mongoose.Schema.Types.ObjectId,
        ref : 'Patient',
        required : true
    },
    services : String,
    total : Number,
    status : {
        type : String,
        enum : ['unpaid', 'paid', 'pending'],
        default : 'unpaid'
    },
    paymentMethod : {
        type : String ,
        enum : ['cash', 'Stripe'],
        default : 'cash'
    },
    transcitionId :String
},
{timestamps : true});

module.exports = mongoose.model ('Bill', billSchema);