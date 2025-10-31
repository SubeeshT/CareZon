const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    unitPrice: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    discountShare: Number,//when user apply the coupon split the coupon discount amount to items depending on the total price
    finalPriceAfterDiscount: Number,//for refund if partial items cancel/return (finalPriceAfterDiscount = totalPrice - discountShare)
    //store product details at time of order to preserve data
    productSnapshot: {
        name: String,
        brand: String,
        category: {
            name: String,
            Discounts: Number,
            DiscountStatus: Boolean
        },
        variantDetails: {
            uom: Number,
            attributes: Map,
            discountValue: Number,
            discountStatus: Boolean,
            images: [{
                url: String,
                altText: String
            }]
        }
    },
    status: {
    type: String,
    enum: ['active', 'cancelled', 'returned'],
    default: 'active'
    },
    returnRequestStatus: {
        type: String,
        enum: ['none', 'pending', 'accepted', 'rejected'],
        default: 'none'
    },
    returnRequestedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    cancelledBy: {
        type: String,
        enum: ['user', 'admin', 'system']
    },
    returnedAt: Date,
    returnReason: String,
    returnedBy: {
        type: String,
        enum: ['user', 'admin', 'system']
    },
    rejectionReason: String,
});

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        unique: true,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [orderItemSchema],
    
    //address details at time of order
    shippingAddress: {
        fullName: {
            type: String,
            required: true
        },
        phoneOne: {
            type: String,
            required: true
        },
        phoneTwo: String,
        area: {
            type: String,
            required: true
        },
        locality: {
            type: String,
            required: true
        },
        landmark: String,
        district: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true,
            default: 'India'
        },
        pin: {
            type: String,
            required: true
        },
        addressType: {
            type: String,
            enum: ['home', 'work', 'other'],
            required: true
        }
    },
    //payment details
    paymentMethod: {
        type: String,
        enum: ['cod', 'card', 'upi', 'netbanking', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentDetails: {
        razorpay_order_id: String,
        razorpay_payment_id: String,
        razorpay_signature: String
    },
    //order totals
    subtotal: {
        type: Number,
        required: true,
        default: 0
    },
    deliveryFee: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'out for delivery', 'delivered', 'cancelled', 'returned'],
        default: 'pending'
    },
    returnRequestStatus: {
        type: String,
        enum: ['none', 'pending', 'accepted', 'rejected'],
        default: 'none'
    },
    couponApplied: {
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Coupon'
        },
        code: String,
        discountValue: Number,
        minPurchaseValue: Number,//for check cancel/return time, if after the cancel/return the total amount will less than coupon eligibility breaks check
        distributed: Boolean,//if have multiple items then it will true
    },
    couponRestored: Boolean,
    paymentFailureReason: String,
    
    returnRequestedAt: Date,

    //delivery date
    estimatedDelivery: Date,
    deliveredAt: Date,
    
    //order lifecycle timestamps
    confirmedAt: Date,
    shippedAt: Date,
    outForDeliveryAt: Date,
    
    //cancellation details
    cancelledAt: Date,
    cancellationReason: String,
    cancelledBy: {
        type: String,
        enum: ['user', 'admin', 'system']
    },

    returnedAt: Date,
    returnReason: String,
    adminNotes: String, //for store return description if have
    returnedBy: {
        type: String,
        enum: ['user', 'admin', 'system']
    },
    rejectionReason: String,

}, { timestamps: true });


//indexing for efficient queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);