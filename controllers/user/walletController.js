const Wallet = require('../../models/walletSchema');
const Order = require('../../models/orderSchema');
const razorpayInstance = require('../../config/razorpay');
const crypto = require('crypto');

const loadWallet = async (req,res) => {
    try {
        const filter = req.query.filter || 'all';
        const userId = req.session.userId;

        let wallet = await Wallet.findOne({userId}).populate({path: 'transactions.orderId', select: 'orderId'});
        if(!wallet) {//if not wallet, create an empty one
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: [],
                totalCredits: 0,
                moneyAdded: 0,
                totalSpent: 0
            });
            await wallet.save();
        }
        let filteredTransactions = wallet.transactions;
        if(filter !== 'all') {
            filteredTransactions = wallet.transactions.filter(transaction => transaction.direction === filter);
        }

        filteredTransactions.sort((a,b) => new Date(b.date) - new Date(a.date));

        return res.status(200).render('user/account/wallet', {wallet, transactions: filteredTransactions, activePage: 'wallet', razorpayKeyId: process.env.RAZORPAYX_KEY_ID });

    } catch (error) {
        console.error("internal error get while loading wallet : ", error);
        return res.status(500).json({success: false, message: "error get while loading wallet"});
    }
}

//create Razorpay order for adding money
const createRazorpayOrder = async (req, res) => {
    try {
        const {amount} = req.body;
        const userId = req.session.userId;

        if (!amount || amount < 10 || amount > 50000) {
            return res.status(400).json({success: false, message: 'amount must be between ₹10 and ₹50,000'});
        }

        //create Razorpay order
        const options = {
            amount: Math.round(amount * 100), //amount in paisa
            currency: 'INR',
            receipt: `WLT${Date.now().toString().slice(-10)}`,
            notes: {
                userId: userId.toString(),
                purpose: 'wallet_recharge'
            }
        };

        const order = await razorpayInstance.orders.create(options);

        //create pending transaction immediately when order is created
        let wallet = await Wallet.findOne({userId});
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: [],
                totalCredits: 0,
                moneyAdded: 0,
                totalSpent: 0
            });
        }

        const pendingTransaction = {
            direction: 'credit',
            status: 'pending',
            moneyFrom: 'addedViaRazorpay',
            paymentMethod: 'card', 
            amount: parseFloat(amount),
            transactionId: order.id,
            description: `payment initiated - Order ID: ${order.id}`,
            date: new Date()
        };

        wallet.transactions.push(pendingTransaction);
        await wallet.save();

        return res.status(200).json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAYX_KEY_ID
            }
        });

    } catch (error) {
        console.error("error creating Razorpay order:", error);
        return res.status(500).json({success: false, message: 'failed to create payment order'});
    }
}

//verify payment and add money to wallet
const verifyPaymentAndAddMoney = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, paymentMethod } = req.body;
        const userId = req.session.userId;

        //verify signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAYX_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({success: false, message: 'invalid payment signature'});
        }

        const validPaymentMethods = ['card', 'upi', 'netbanking'];
        if (!validPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({success: false, message: 'invalid payment method'});
        }

        let wallet = await Wallet.findOne({userId});
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: [],
                totalCredits: 0,
                moneyAdded: 0,
                totalSpent: 0
            });
        }

        const pendingTransactionIndex = wallet.transactions.findIndex(t => t.transactionId === razorpay_order_id && t.status === 'pending');

        if (pendingTransactionIndex !== -1) {
            wallet.transactions[pendingTransactionIndex].status = 'success';
            wallet.transactions[pendingTransactionIndex].transactionId = razorpay_payment_id;
            wallet.transactions[pendingTransactionIndex].paymentMethod = paymentMethod;
            wallet.transactions[pendingTransactionIndex].description = `Money added via Razorpay (${paymentMethod.toUpperCase()}) - Payment ID: ${razorpay_payment_id}`;
        } else {//if no pending transaction found, create new success transaction
            const transaction = {
                direction: 'credit',
                status: 'success',
                moneyFrom: 'addedViaRazorpay',
                paymentMethod: paymentMethod,
                amount: parseFloat(amount),
                transactionId: razorpay_payment_id,
                description: `money added via Razorpay (${paymentMethod.toUpperCase()}) - Payment ID: ${razorpay_payment_id}`,
                date: new Date()
            };
            wallet.transactions.push(transaction);
        }

        wallet.balance += parseFloat(amount);
        wallet.totalCredits += parseFloat(amount);
        wallet.moneyAdded += parseFloat(amount);

        await wallet.save();

        return res.status(200).json({success: true, message: 'money added successfully', newBalance: wallet.balance});

    } catch (error) {
        console.error("Error verifying payment:", error);
        return res.status(500).json({success: false, message: 'Payment verification failed'});
    }
}

//handle payment failure
const handlePaymentFailure = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, amount, error_description, paymentMethod } = req.body;
        const userId = req.session.userId;

        let wallet = await Wallet.findOne({userId});
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: [],
                totalCredits: 0,
                moneyAdded: 0,
                totalSpent: 0
            });
        }

        //find and update the pending transaction to failed
        const pendingTransactionIndex = wallet.transactions.findIndex(t => t.transactionId === razorpay_order_id && t.status === 'pending');

        if (pendingTransactionIndex !== -1) {
            //update existing pending transaction to failed
            wallet.transactions[pendingTransactionIndex].status = 'failed';
            wallet.transactions[pendingTransactionIndex].transactionId = razorpay_payment_id || razorpay_order_id;
            wallet.transactions[pendingTransactionIndex].paymentMethod = paymentMethod || wallet.transactions[pendingTransactionIndex].paymentMethod;
            wallet.transactions[pendingTransactionIndex].description = `Payment failed - ${error_description || 'Transaction unsuccessful'} - Order ID: ${razorpay_order_id}`;
        } else {
            //if no pending transaction found, create new failed transaction
            const transaction = {
                direction: 'credit',
                status: 'failed',
                moneyFrom: 'addedViaRazorpay',
                paymentMethod: paymentMethod || 'card',
                amount: parseFloat(amount),
                transactionId: razorpay_payment_id || razorpay_order_id,
                description: `payment failed - ${error_description || 'transaction unsuccessful'} - Order ID: ${razorpay_order_id}`,
                date: new Date()
            };
            wallet.transactions.push(transaction);
        }

        await wallet.save();

        return res.status(200).json({success: true, message: 'payment failure recorded', failed: true});

    } catch (error) {
        console.error("Error recording payment failure:", error);
        return res.status(500).json({success: false, message: 'Failed to record payment failure'});
    }
}

module.exports = {
    loadWallet,
    createRazorpayOrder,
    verifyPaymentAndAddMoney,
    handlePaymentFailure
}





// 1 - Use Razorpay test cards:

// Card: 4111 1111 1111 1111 or 5089 9214 5806 3914
// CVV: Any 3 digits
// Expiry: Any future date
// Name: Any name

// 2 - For UPI: Use success@razorpay for successful payment

// 3 - For testing failure: Use fail@razorpay for UPI or decline the payment