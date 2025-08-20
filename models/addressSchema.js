const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    fullName: {
        type: String,
        require: true,
    },
    phoneOne:{
        type: String,
        require: true
    },
    phoneTwo:{
        type: String,
        require: false,
        default: null,
    },
    pin:{
        type: String,
        require: true
    },
    locality:{
        type: String,
        require: true
    },
    area:{
        type: String,
        require: true,
    },
    district:{
        type: String,
        require: true
    },
    state:{
        type: String,
        require: true
    },
    country:{
        type: String,
        require: true,
    },
    landmark:{
        type: String,
        require: false,
        default: null,
    },
    home:{
        type: String,
        require: false,
        default: null
    },
    work:{
        type: String,
        require: false,
        default: null
    },
    other:{
        type: String,
        require: false,
        default: null
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        require: true
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