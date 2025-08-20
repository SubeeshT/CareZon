const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      required: false,
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId;
      },
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
      otp: {
      code: String,
      expiresAt: Date,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    isGoogleUser: { 
      type: Boolean,
      default: false
    },
    DOB:{
      type: Date,
      require: false,
    },
    gender:{
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    },
    profileImage: {
      type: String,
      default: null, 
    },
    addresses:{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Address'
    },

    cart: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: {
          type: Number,
          default: 1,
        },
        price: Number,
      },
    ],

    wallet: {
      balance: {
        type: Number,
        default: 0,
      },
      transactions: [
        {
          type: {
            type: String, // credit or debit
          },
          amount: Number,
          date: {
            type: Date,
            default: Date.now,
          },
          description: String,
        },
      ],
    },

    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: String, 
    },
    redeemed: {
      type: Boolean,
      default: false,
    },
    redeemedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    searchHistory: [
      {
        keyword: String,
        searchedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Reset password token
    resetToken: String,
    resetTokenExpiry: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);

