const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 2,
        maxlength: 50,
        collation: { locale: 'en', strength: 2 } 
    },
    logo: {
        type: String,
        required: false,
        default: null
    },
    logoPublicId: {
        type: String,
        required: false,
        default: null
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    status: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true 
});


// Method to get status text
brandSchema.methods.getStatusText = function() {
    return this.status ? 'Active' : 'Inactive';
};

// Static methods
brandSchema.statics.findActive = function() {
    return this.find({ status: true }).sort({ name: 1 });
};

brandSchema.statics.findInactive = function() {
    return this.find({ status: false }).sort({ name: 1 });
};

module.exports = mongoose.model('Brand', brandSchema);