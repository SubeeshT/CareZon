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
        min: 1
    },
    unitPrice: {
        type: Number,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true
    },
    // Store product details at time of order to preserve data
    productSnapshot: {
        name: String,
        brand: String,
        category: String,
        variantDetails: {
            uom: Number,
            attributes: Map,
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
    
    // Address details at time of order
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
    
    // Payment details
    paymentMethod: {
        type: String,
        enum: ['cod', 'card', 'upi', 'net Banking'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    
    // Order totals
    subtotal: {
        type: Number,
        required: true
    },
    deliveryFee: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    
    // Order status
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
        default: 'pending'
    },
    
    // Tracking information
    trackingNumber: String,
    estimatedDelivery: Date,
    deliveredAt: Date,
    
    // Order lifecycle timestamps
    confirmedAt: Date,
    shippedAt: Date,
    cancelledAt: Date,
    
    // Cancellation details
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
    
    // Additional notes
    orderNotes: String,
    adminNotes: String

}, { timestamps: true });


// Indexing for efficient queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);