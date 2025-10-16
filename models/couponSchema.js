const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
    },
    discountValue: {
        type: Number,
        required: true,
        default: 10
    },
    minPurchaseValue: {
        type: Number,
        default: 100,
        min: 100
    },
    limit: {//per user have limit to use same coupons
        type: Number,
        required: true,
        default: 1,
        min: 1
    },
    description: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true,
        default: new Date
    },
    expDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'blocked', 'expired', 'upcoming'],
        required: true,
        default: 'active'
    },
    usedBy: [{//for track usage count limits per user
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        usageCount: {
            type: Number,
            default: 0
        }
    }],

},{timestamps: true})

module.exports = mongoose.model('Coupon', couponSchema);