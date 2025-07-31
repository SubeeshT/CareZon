const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Added: Doctor details
  doctor: {
    name: {
      type: String,
      required: true
    },
    hospital: String,
    contact: String
  },
  // Added: Patient details
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
    public_id: String,
    url: String,
    altText: String
  }],
  prescribedMedicines: [{
    medicineName: String,
    dosage: String,
    duration: String
  }],
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
  expiryDate: {
    type: Date,
    required: true
  },
  validityPeriod: {
    type: Number,
    default: 0
  },
  rejectionReason: String,
  //Associated orders
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
}, { timestamps: true });

// Indexing
prescriptionSchema.index({ user: 1, status: 1 });
prescriptionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Prescription', prescriptionSchema);