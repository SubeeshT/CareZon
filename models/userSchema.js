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
      //default: null,
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
      //default: null,
    },

    isGoogleUser: { 
      type: Boolean,
      default: false
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

