const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  rating: {
    type: Number,
    //required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    //required: true,
    trim: true,
    maxlength: 1000
  },
  helpfulVotes: {
    type: Number,
    default: 0,
    min: 0
  },
  images: [{
    public_id: String,
    url: String,
    altText: String
  }],
}, { timestamps: true });

// Compound index to prevent duplicate reviews
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ rating: 1 });

module.exports = mongoose.model('Review', reviewSchema);