const mongoose = require('mongoose');

const walletSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    },
    transactions: [{
        direction: {
            type: String,
            required: true,
            enum: ['credit', 'debit']
        },
        status: {
            type: String,
            enum: ['success', 'failed', 'pending'],
            default: 'success'
        },
        moneyFrom: { 
            type: String,
            enum: ['cancelRefund', 'returnRefund', 'addedViaRazorpay', 'orderPayment','referral'],//included order cancel/return refund also
            required: true,
        },
        paymentMethod: { 
            type: String,
            enum: ['card', 'upi', 'netbanking', 'wallet', 'cod'],
            required: true,
        },
        amount: {//adding amount
            type: Number,
            required: true,
            min: 10
        },
        orderId: { //db order _id, not orderId , (cancel/return order _id)
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        },
        transactionId: {
            type: String
        },
        description: {
            type: String
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    totalCredits: { //total credit amount via wallet, cancel order amount and return order amount
        type: Number,
        required: true,
        default: 0
    },
    moneyAdded: {//money added wallet via wallet(card, UIP, net Banking)
        type: Number,
        required: true,
        default: 0
    },
    totalSpent: {
        type: Number,
        required: true,
        default: 0
    }
}, {timestamps: true})

module.exports = mongoose.model('Wallet', walletSchema);