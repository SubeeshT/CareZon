const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    brand: {
        type: String,
        required: true,
        trim: true
    },
    regularPrice: {
        type: Number,
        required: true
    },
    salesPrice: {
        type: Number,
        required: true
    },
    stock: {
        type: Number,
        required: true
    },
    offer: {
        type: Number, // example: 20 for 20% off
        default: 0
    },
    offerStatus: {
        type: Boolean,
        default: false
    },
    productStatus: {
        type: Boolean,
        default: true
    },
    expiryDate: {
        type: Date
    },
    addedOn: {
        type: Date,
        default: Date.now
    },
    quantity: {
        type: Number,
        default: 1
    },
    dosage: {
        type: String
    },
    milligrams: {
        type: Number
    },
    milliliters: {
        type: Number
    },
    kilograms: {
        type: Number
    },
    color: {
        type: String
    },
    material: {
        type: String
    },
    uom: {
        type: Number,
        default: 1
    },
    description: {
        type: String,
        trim: true
    },
    images: [
        {
            type: String 
        }
    ]
}, {
    timestamps: true
});

module.exports = mongoose.model('Product', productSchema);
