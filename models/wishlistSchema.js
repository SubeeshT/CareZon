const mongoose = require('mongoose');

const wishlistSchema = mongoose.Schema({
    userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {timestamps: true})

//for get totalItems count
wishlistSchema.virtual('totalItems').get(function() {
    return this.items.length;
});

module.exports = mongoose.model('Wishlist', wishlistSchema);