const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
    },
    phoneOne:{
        type: String,
        required: true
    },
    phoneTwo:{
        type: String,
        required: false,
        default: null,
    },
    pin:{
        type: String,
        required: true
    },
    locality:{
        type: String,
        required: true
    },
    area:{
        type: String,
        required: true,
    },
    district:{
        type: String,
        required: true
    },
    state:{
        type: String,
        required: true
    },
    country:{
        type: String,
        required: true,
    },
    landmark:{
        type: String,
        required: false,
        default: null,
    },
    addressType: {
        type: String,
        required: true,
        enum: ['home', 'work', 'other']
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }

},{
    timestamps: true 
})

module.exports = mongoose.model('Address', addressSchema);