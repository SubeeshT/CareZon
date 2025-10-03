const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantId: {
  type: mongoose.Schema.Types.ObjectId,
  required: true
  },
  doctor: {
    name: {
      type: String,
      required: true
    },
    hospital: String,
  },
  patient: {
    name: {
      type: String,
      required: true
    },
    age: Number,
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other']
    },
  },
  prescriptionImages: [{
    public_id: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    altText: String,
  }],
  medicineName: {
    type: String,
  },
  uom: {
  type: Number, //unit of Measurement/ this means count, one tablet strip have 10 or 15 count normally. 
  required: true
  },
  usedUom: {
  type: Number,
  default: 0,
  min: 0
  },
  prescriptionDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Verified', 'Rejected', 'Expired'],
    default: 'Pending'
  },
  verificationDate: {
    type: Date
  },
  expiryDate: { //it means every medicines have a time period to eat. dr suggest only 5 days or  2 week or 1 month. that time period is i means as expiry date
    type: Date,
    required: true
  },
  rejectionReason: {
    type: String,
    default: null
  }

}, { timestamps: true });

//indexing
prescriptionSchema.index({ userId: 1, status: 1 });
prescriptionSchema.index({ status: 1, createdAt: -1 });
prescriptionSchema.index({ medicineName: 'text' });
prescriptionSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('Prescription', prescriptionSchema);
