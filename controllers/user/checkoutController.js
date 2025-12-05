const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const { getVariantLabel } = require('../../utils/variantAttribute');
const { calculateDiscountedPrice } = require('../../utils/discountValue');
const razorpayInstance = require('../../config/razorpay');
const crypto = require('crypto');
const { default: mongoose } = require('mongoose');



const COD_MAX_AMOUNT = 5000;

const loadCheckout = async (req,res) => {
    try {
        const addresses = await Address.find({userId: req.session.userId}).sort({createdAt: -1});
        
        const cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed Discounts DiscountStatus'}]});

        if(!cart || cart.items.length === 0){
            return res.redirect('/cart');
        }

        for(const item of cart.items){
            const product = item.productId;

            if(!product || !product.brand || !product.category || !product.brand.isListed || !product.category.isListed){
                return res.redirect('/cart');
            }

            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if(!variant || !variant.isListed){
                return res.redirect('/cart');
            }
        }

        //check for stock issues
        let hasStockIssues = false;
        const stockIssues = [];

        for(const item of cart.items){
            const product = item.productId;
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            
            if(item.quantity > 0 && variant.stock < item.quantity){
                hasStockIssues = true;
                stockIssues.push({
                    productName: product.name,
                    requested: item.quantity,
                    available: variant.stock
                });
            }
        }

        if(hasStockIssues){
            return res.redirect('/cart?error=insufficient-stock');
        }

        //check if cart has any valid items for checkout (quantity > 0 and stock available)
        const hasValidItems = cart.items.some(item => {
            const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
            return item.quantity > 0 && variant.stock >= item.quantity;
        });

        if(!hasValidItems){
            return res.redirect('/cart?error=no-valid-items');
        }

        //variant labels for display and recalculate prices with proper discounts , using the utils function
        if (cart && cart.items) {
            
            cart.items.forEach(item => {
                const product = item.productId;
                const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                if (variant && product.category) {
                    item.variantLabel = getVariantLabel(variant, product.category.name);
                    
                    //recalculate the correct sales price based on greater discount from the utils function
                    const correctSalesPrice = calculateDiscountedPrice(
                        variant.regularPrice,
                        variant.discountValue || 0,
                        variant.discountStatus || false,
                        product.category.Discounts || 0,
                        product.category.DiscountStatus || false
                    );
                   
                    item.subtotal = correctSalesPrice * item.quantity;
                    
                    item.effectiveSalesPrice = correctSalesPrice;
                }
            });
            
            cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);
        }

        //calculate if COD is allowed - initially without coupon and COD eligibility will be dynamically checked when coupon is applied/removed in frontend
        const subtotal = cart.totalAmount || 0;
        const deliveryFee = subtotal < 300 ? 50 : 0;
        const totalWithDelivery = subtotal + deliveryFee;
        const initialCODAllowed = totalWithDelivery <= COD_MAX_AMOUNT;

        return res.status(200).render('cart/checkout', {
            addresses: addresses || [], 
            cart: cart, 
            success: true,
            isCODAllowed: initialCODAllowed,
            COD_MAX_AMOUNT: COD_MAX_AMOUNT
        });

    } catch (error) {
        console.error("error loading checkout page:", error);
        return res.status(500).render('pageNotFound', {success: false, statusCode: 500, message: "something went wrong while loading checkout page"});
    }
}

const getWalletBalance = async (req, res) => {
    try {  
        const wallet = await Wallet.findOne({userId: req.session.userId});
        
        return res.json({success: true, balance: wallet ? wallet.balance : 0});
    } catch (error) {
        console.error('error fetching wallet balance:', error);
        return res.status(500).json({success: false, message: 'error fetching balance'});
    }
}

const getCoupons = async (req, res) => {
    try {
        const {orderAmount} = req.query;
        const userId = req.session.userId;
        
        const coupons = await Coupon.find({status: { $ne: 'blocked' }});
        
        const now = new Date();
   
        const formattedCoupons = coupons.map(coupon => {
            const userUsage = coupon.usedBy.find(u => u.userId.toString() === userId.toString());
            const usageCount = userUsage ? userUsage.usageCount : 0;
            
            let actualStatus = coupon.status;
            if (new Date(coupon.expDate) < now) {
                actualStatus = 'expired';
            } else if (new Date(coupon.startDate) > now) {
                actualStatus = 'upcoming';
            }
            
            return {
                _id: coupon._id,
                code: coupon.code,
                discountValue: coupon.discountValue,
                minPurchaseValue: coupon.minPurchaseValue,
                description: coupon.description,
                status: actualStatus,
                usageCount: usageCount,
                limit: coupon.limit,
                canUse: usageCount < coupon.limit && actualStatus === 'active'
            };
        });
        
        return res.json({success: true, coupons: formattedCoupons});
    } catch (error) {
        console.error('error fetching coupons:', error);
        return res.status(500).json({success: false, message: 'error fetching coupons'});
    }
};

const applyCoupon = async (req, res) => {
    try {
        const {code, orderAmount} = req.body;
        const userId = req.session.userId;
        
        const coupon = await Coupon.findOne({code: code.toUpperCase()});
        
        if (!coupon) {
            return res.status(404).json({success: false, message: 'invalid coupon code'});
        }
        
        if (coupon.status !== 'active') {
            return res.status(400).json({success: false, message: 'coupon is not active'});
        }
        
        if (orderAmount < coupon.minPurchaseValue) {
            return res.status(400).json({success: false, message: `minimum purchase amount is ₹${coupon.minPurchaseValue}`});
        }
        
        const userUsage = coupon.usedBy.find(u => u.userId.toString() === userId.toString());
        if (userUsage && userUsage.usageCount >= coupon.limit) {
            return res.status(400).json({success: false, message: 'coupon usage limit reached'});
        }
        
        return res.json({
            success: true,
            coupon: {
                _id: coupon._id,
                code: coupon.code,
                discountValue: coupon.discountValue,
                minPurchaseValue: coupon.minPurchaseValue,
                description: coupon.description
            }
        });
    } catch (error) {
        console.error('error applying coupon : ', error);
        return res.status(500).json({success: false, message: 'error applying coupon'});
    }
};

const createRazorpayOrder = async (req, res) => {
    try {
        const {amount} = req.body;
        const amountInPaise = Math.round(parseFloat(amount) * 100); //round the amount and convert to paise

        const options = {
            amount: amountInPaise,                    
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpayInstance.orders.create(options);
        
        return res.status(200).json({success: true, order: order, key_id: process.env.RAZORPAYX_KEY_ID});

    } catch (error) {
        console.error('error creating Razorpay order:', error);
        return res.status(500).json({success: false, message: 'error creating payment order'});
    }
};

const verifyPayment = async (req, res) => {
    try {
        const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
        
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAYX_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            return res.status(200).json({success: true, message: "payment verified successfully"});
        } else {
            return res.status(400).json({success: false, message: "invalid signature"});
        }
    } catch (error) {
        console.error('internal error get while verifying payment : ', error);
        return res.status(500).json({success: false, message: 'error verifying payment'});
    }
};

const placeOrder = async (req, res) => {

    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        
        const {addressId, paymentMethod, orderedItems, couponId} = req.body;
        const userId = req.session.userId;
        
        if (!addressId || !paymentMethod || !orderedItems || orderedItems.length === 0) {
            return res.status(400).json({success: false, message: 'missing required order information'});
        } 
       
        const address = await Address.findOne({ _id: addressId, userId }).session(session);
        if (!address) {
            return res.status(404).json({success: false,message: 'address not found'});
        }
        
        const cart = await Cart.findOne({ userId }).populate({path: 'items.productId', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: '_id name isListed Discounts DiscountStatus' }]}).session(session); 
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({success: false, message: 'cart is empty'});
        }
        
        //prepare order items with stock validation
        const orderItems = [];
        let subtotal = 0;
        const stockUpdates = [];
        
        for (const orderedItem of orderedItems) {
            const cartItem = cart.items.find(item => 
                item.productId._id.toString() === orderedItem.productId.toString() && item.variantId.toString() === orderedItem.variantId.toString());
            
            if (!cartItem) {
                return res.status(404).json({success: false, message: `item not found in cart: ${orderedItem.productId}`});
            }
            
            const product = cartItem.productId;
            const variant = product.variants.find(v => v._id.toString() === orderedItem.variantId.toString());

            if (!variant) {
                return res.status(404).json({success: false, message: `variant not found: ${orderedItem.variantId}`});
            }

            if (variant.stock < orderedItem.quantity) {
                return res.status(400).json({success: false, message: `insufficient stock for ${product.name}. Available: ${variant.stock}, Requested: ${orderedItem.quantity}`});
            }
            if(!variant.isListed){
                return res.status(403).json({success: false, message: `The item is not available now : ${product.name}.`});
            }

            //calculate correct discount price with utils function
            const correctPrice = calculateDiscountedPrice(
                variant.regularPrice,
                variant.discountValue || 0,
                variant.discountStatus || false,
                product.category.Discounts || 0,
                product.category.DiscountStatus || false
            );

            //prepare order item
            const orderItem = {
                productId: product._id,
                variantId: variant._id,
                quantity: orderedItem.quantity,
                unitPrice: correctPrice,
                totalPrice: correctPrice * orderedItem.quantity,
                productSnapshot: {
                    name: product.name,
                    brand: product.brand.name,
                    category: {
                        name: product.category.name,
                        Discounts: product.category.Discounts,
                        DiscountStatus: product.category.DiscountStatus
                    },
                    variantDetails: {
                        uom: variant.uom,
                        attributes: variant.attributes,
                        discountValue: variant.discountValue,
                        discountStatus: variant.discountStatus,
                        images: variant.images.slice(0, 1)
                    }
                }
            };
            
            orderItems.push(orderItem);
            subtotal += orderItem.totalPrice;
            
            stockUpdates.push({
                productId: product._id,
                variantId: variant._id,
                quantityToReduce: orderedItem.quantity
            });
        }

        let discountAmount = 0;
        let appliedCoupon = null;

        if (couponId) {
            appliedCoupon = await Coupon.findById(couponId).session(session);

            if(appliedCoupon && appliedCoupon.status === 'blocked'){
                return res.status(403).json({success: false, message: "applied coupon not found"});
            }
            
            if (appliedCoupon && appliedCoupon.status === 'active') {
                if (subtotal >= appliedCoupon.minPurchaseValue) {
                    discountAmount = appliedCoupon.discountValue;
                    
                    const isMultipleItems = orderItems.length > 1;
                    
                    if (isMultipleItems) {
                        let remainingDiscount = discountAmount;
                        
                        orderItems.forEach((item, index) => {
                            if (index === orderItems.length - 1) {
                                item.discountShare = remainingDiscount;
                            } else {
                                const proportion = item.totalPrice / subtotal;
                                item.discountShare = Math.round(proportion * discountAmount * 100) / 100;
                                remainingDiscount -= item.discountShare;
                            }
                            item.finalPriceAfterDiscount = item.totalPrice - item.discountShare;
                        });
                    } else {
                        orderItems[0].discountShare = discountAmount;
                        orderItems[0].finalPriceAfterDiscount = orderItems[0].totalPrice - discountAmount;
                    }
                    
                    const userUsageIndex = appliedCoupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
                    
                    if (userUsageIndex >= 0) {
                        appliedCoupon.usedBy[userUsageIndex].usageCount += 1;
                    } else {
                        appliedCoupon.usedBy.push({userId, usageCount: 1});
                    }
                    
                    await appliedCoupon.save({session});
                }
            }
        }

        const deliveryFee = subtotal < 300 ? 50 : 0;
        const totalAmount = subtotal + deliveryFee - discountAmount; 

        if(paymentMethod === 'cod' && totalAmount > COD_MAX_AMOUNT){
            return res.status(400).json({success: false, message: `Cash on Delivery is not available for orders above ₹${COD_MAX_AMOUNT}. Please choose another payment method.`});
        }

        if (paymentMethod !== 'cod' && paymentMethod !=='wallet') {
            const {razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
            
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                return res.status(400).json({success: false, message: 'payment verification details missing'});
            }
            
            //verify signature
            const sign = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSign = crypto
                .createHmac("sha256", process.env.RAZORPAYX_KEY_SECRET)
                .update(sign.toString())
                .digest("hex");
            
            if (razorpay_signature !== expectedSign) {
                return res.status(400).json({success: false, message: 'Payment verification failed'});
            }
        }

        if (paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({userId}).session(session);
            
            if (!wallet || wallet.balance < totalAmount) {
                return res.status(400).json({success: false, message: 'insufficient wallet balance'});
            } 
        }        

        //generate unique orderId
        const orderCount = await Order.countDocuments();
        const orderId = `ORD${Date.now()}${String(orderCount + 1).padStart(6, '0')}`;

        const order = new Order({
            orderId,
            userId,
            items: orderItems,
            shippingAddress: {
                fullName: address.fullName,
                phoneOne: address.phoneOne,
                phoneTwo: address.phoneTwo,
                area: address.area,
                locality: address.locality,
                landmark: address.landmark,
                district: address.district,
                state: address.state,
                country: address.country,
                pin: address.pin,
                addressType: address.addressType
            },
            paymentMethod,
            paymentStatus: paymentMethod === 'cod' ? 'pending' : 'completed',
            ...(paymentMethod !== 'cod' && { //payment details for online payments 
                paymentDetails: {
                    razorpay_order_id: req.body.razorpay_order_id,
                    razorpay_payment_id: req.body.razorpay_payment_id,
                    razorpay_signature: req.body.razorpay_signature
                }
            }),
            subtotal,
            deliveryFee,
            discount: discountAmount,
            couponApplied: appliedCoupon ? {
                couponId: appliedCoupon._id,
                code: appliedCoupon.code,
                discountValue: discountAmount,
                minPurchaseValue: appliedCoupon.minPurchaseValue,
                distributed: orderItems.length > 1
            } : null,
            totalAmount,
            orderStatus: 'confirmed',
            confirmedAt: new Date(),
            estimatedDelivery: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        });
        
        await order.save({ session });

        //if wallet payment, deduct balance
        if (paymentMethod === 'wallet') {
            await Wallet.findOneAndUpdate(
                {userId},
                {
                    $inc: { balance: -totalAmount, totalSpent: totalAmount },
                    $push: {
                        transactions: {
                            direction: 'debit',
                            status: 'success',
                            moneyFrom: 'orderPayment',
                            paymentMethod: 'wallet',
                            amount: totalAmount,
                            orderId: order._id,
                            description: `Payment for order ${order.orderId}`,
                            date: new Date()
                        }
                    }
                },
                { session }
            );
        }
        
        for (const update of stockUpdates) {
            await Product.updateOne(
                { "_id": update.productId, "variants._id": update.variantId },
                { $inc: {"variants.$.stock": -update.quantityToReduce} },
                { session }
            );
        }
        
        //remove ordered items from cart 
        cart.items = cart.items.map(cartItem => {
            const orderedItem = orderedItems.find(ordered => 
                cartItem.productId._id.toString() === ordered.productId.toString() && cartItem.variantId.toString() === ordered.variantId.toString());
            
            if (orderedItem) {
                //if partial quantity was ordered, reduce cart quantity
                if (cartItem.quantity > orderedItem.quantity) {
                    const product = cartItem.productId;
                    const variant = product.variants.find(v => v._id.toString() === cartItem.variantId.toString());
                    const remainingQty = cartItem.quantity - orderedItem.quantity;
                    
                    return {
                        ...cartItem,
                        quantity: remainingQty,
                        subtotal: variant.salesPrice * remainingQty
                    };
                }
                return null;
            }
            return cartItem;
        }).filter(item => item !== null);
        
        cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);
        await cart.save({ session });
        
        await session.commitTransaction();
        
        return res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.orderId,
            orderDetails: {
                orderId: order.orderId,
                totalAmount: order.totalAmount,
                itemCount: order.items.length,
                estimatedDelivery: order.estimatedDelivery
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        console.error('Error get while placing order:', error);
        return res.status(500).json({success: false, message: error.message || 'Error placing order'});
    } finally {
        session.endSession();
    }
}

//similar to placeOrder but, don't update stock, don't clear cart, set orderStatus as 'pending', set paymentStatus as 'failed', coupon discount only apply, usage count is not change
const placeFailedPaymentOrder = async (req, res) => {
    try {
        const {addressId, paymentMethod, orderedItems, couponId, paymentFailureReason} = req.body;
        const userId = req.session.userId;
        
        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(404).json({success: false, message: 'address not found'});
        }

        const cart = await Cart.findOne({ userId }).populate({path: 'items.productId',  populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: '_id name isListed Discounts DiscountStatus' }]}); 
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({success: false, message: 'Cart is empty'});
        }
        
        const orderItems = [];
        let subtotal = 0;
        
        for (const orderedItem of orderedItems) {
            const cartItem = cart.items.find(item => 
                item.productId._id.toString() === orderedItem.productId.toString() && item.variantId.toString() === orderedItem.variantId.toString()
            );
            
            if (!cartItem) continue;
            
            const product = cartItem.productId;
            const variant = product.variants.find(v => v._id.toString() === orderedItem.variantId.toString());

            if (!variant) continue;

            const correctPrice = calculateDiscountedPrice(//calculate discount price with utils function
                variant.regularPrice,
                variant.discountValue || 0,
                variant.discountStatus || false,
                product.category.Discounts || 0,
                product.category.DiscountStatus || false
            );

            const orderItem = {
                productId: product._id,
                variantId: variant._id,
                quantity: orderedItem.quantity,
                unitPrice: correctPrice,
                totalPrice: correctPrice * orderedItem.quantity,
                productSnapshot: {
                    name: product.name,
                    brand: product.brand.name,
                    category: {
                        name: product.category.name,
                        Discounts: product.category.Discounts,
                        DiscountStatus: product.category.DiscountStatus
                    },
                    variantDetails: {
                        uom: variant.uom,
                        attributes: variant.attributes,
                        discountValue: variant.discountValue,
                        discountStatus: variant.discountStatus,
                        images: variant.images.slice(0, 1)
                    }
                }
            };
            
            orderItems.push(orderItem);
            subtotal += orderItem.totalPrice;
        }
        
        let discountAmount = 0;
        let appliedCoupon = null;

        if (couponId) {
            appliedCoupon = await Coupon.findById(couponId);
            
            if (appliedCoupon && appliedCoupon.status === 'active' && subtotal >= appliedCoupon.minPurchaseValue) {
                discountAmount = appliedCoupon.discountValue;
                
                const isMultipleItems = orderItems.length > 1;
                
                if (isMultipleItems) {
                    let remainingDiscount = discountAmount;
                    
                    orderItems.forEach((item, index) => {
                        if (index === orderItems.length - 1) {
                            item.discountShare = remainingDiscount;
                        } else {
                            const proportion = item.totalPrice / subtotal;
                            item.discountShare = Math.round(proportion * discountAmount * 100) / 100;
                            remainingDiscount -= item.discountShare;
                        }
                        item.finalPriceAfterDiscount = item.totalPrice - item.discountShare;
                    });
                } else {
                    orderItems[0].discountShare = discountAmount;
                    orderItems[0].finalPriceAfterDiscount = orderItems[0].totalPrice - discountAmount;
                }
            }
        }
        
        const deliveryFee = subtotal < 300 ? 50 : 0;
        const totalAmount = subtotal + deliveryFee - discountAmount;
        
        //generating orderId
        const orderCount = await Order.countDocuments();
        const orderId = `ORD${Date.now()}${String(orderCount + 1).padStart(6, '0')}`;
        
        //create order with pending status for retrying
        const order = new Order({
            orderId,
            userId,
            items: orderItems,
            shippingAddress: {
                fullName: address.fullName,
                phoneOne: address.phoneOne,
                phoneTwo: address.phoneTwo,
                area: address.area,
                locality: address.locality,
                landmark: address.landmark,
                district: address.district,
                state: address.state,
                country: address.country,
                pin: address.pin,
                addressType: address.addressType
            },
            paymentMethod,
            paymentStatus: 'failed',
            paymentFailureReason,
            subtotal,
            deliveryFee,
            discount: discountAmount,
            couponApplied: appliedCoupon ? {
                couponId: appliedCoupon._id,
                code: appliedCoupon.code,
                discountValue: discountAmount,
                minPurchaseValue: appliedCoupon.minPurchaseValue,
                distributed: orderItems.length > 1
            } : null,
            totalAmount,
            orderStatus: 'pending'
        });
        
        await order.save();
        
        return res.json({success: true, orderId: order.orderId, message: 'order created with pending status'});
        
    } catch (error) {
        console.error('error creating failed order:', error);
        return res.status(500).json({success: false, message: 'error creating order'});
    }
};

const retryPayment = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        
        const {orderId, paymentMethod, razorpay_order_id, razorpay_payment_id, razorpay_signature} = req.body;
        const userId = req.session.userId;
        
        const order = await Order.findOne({orderId, userId, orderStatus: 'pending', paymentStatus: 'failed'}).session(session);
        
        if (!order) {
            return res.status(404).json({success: false, message: 'order not found or already processed'});
        }
        
        if (paymentMethod) {
            order.paymentMethod = paymentMethod;
        }
        
        if (order.paymentMethod === 'cod' && order.totalAmount > COD_MAX_AMOUNT) {
            return res.status(400).json({success: false, message: `Cash on Delivery is not available for orders above ₹${COD_MAX_AMOUNT}. Please choose another payment method.`});
        }
        
        if (order.paymentMethod !== 'cod' && order.paymentMethod !== 'wallet') {
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                return res.status(400).json({success: false, message: 'payment verification details missing'});
            }
            
            //verify signature
            const sign = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSign = crypto
                .createHmac("sha256", process.env.RAZORPAYX_KEY_SECRET)
                .update(sign.toString())
                .digest("hex");
            
            if (razorpay_signature !== expectedSign) {
                return res.status(400).json({success: false, message: 'payment verification failed'});
            }
            
            order.paymentDetails = {
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            };
        }
        
        if (order.paymentMethod === 'wallet') {
            const wallet = await Wallet.findOne({userId}).session(session);
            
            if (!wallet || wallet.balance < order.totalAmount) {
                return res.status(400).json({success: false, message: 'insufficient wallet balance'});
            }
            
            await Wallet.findOneAndUpdate(
                {userId},
                {
                    $inc: { balance: -order.totalAmount, totalSpent: order.totalAmount },
                    $push: {
                        transactions: {
                            direction: 'debit',
                            status: 'success',
                            moneyFrom: 'orderPayment',
                            paymentMethod: 'wallet',
                            amount: order.totalAmount,
                            orderId: order._id,
                            description: `Retry payment for order ${order.orderId}`,
                            date: new Date()
                        }
                    }
                },
                { session }
            );
        }
        
        //check stock availability for all items
        const stockUpdates = [];
        for (const item of order.items) {
            const product = await Product.findById(item.productId).session(session);
            if (!product) {
                return res.status(404).json({success: false, message: `product not found: ${item.productId}`});
            }
            
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (!variant) {
                return res.status(404).json({success: false, message: `variant not found: ${item.variantId}`});
            }
            
            if (variant.stock < item.quantity) {
                return res.status(400).json({success: false, message: `insufficient stock for ${product.name}. Available: ${variant.stock}, Required: ${item.quantity}`});
            }

            if(!variant.isListed){
                return res.status(403).json({success: false, message: `The item is not available now : ${product.name}.`});
            }
            
            stockUpdates.push({
                productId: product._id,
                variantId: variant._id,
                quantityToReduce: item.quantity
            });
        }
        
        for (const update of stockUpdates) {
            await Product.updateOne(
                { "_id": update.productId, "variants._id": update.variantId },
                { $inc: {"variants.$.stock": -update.quantityToReduce} },
                { session }
            );
        }
        
        if (order.couponApplied && order.couponApplied.couponId) {
            const coupon = await Coupon.findById(order.couponApplied.couponId).session(session);
            
            if (coupon && coupon.status === 'active') {
                const userUsageIndex = coupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
                
                if (userUsageIndex >= 0) {
                    coupon.usedBy[userUsageIndex].usageCount += 1;
                } else {
                    coupon.usedBy.push({userId, usageCount: 1});
                }
                
                await coupon.save({session});
            }
        }
        
        const cart = await Cart.findOne({userId}).session(session);
        if (cart) {
            cart.items = cart.items.filter(cartItem => {
                const isOrdered = order.items.some(orderItem => 
                    cartItem.productId.toString() === orderItem.productId.toString() && 
                    cartItem.variantId.toString() === orderItem.variantId.toString()
                );
                return !isOrdered;
            });
            
            cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);
            await cart.save({session});
        }
        
        order.orderStatus = 'confirmed';
        order.paymentStatus = order.paymentMethod === 'cod' ? 'pending' : 'completed';
        order.confirmedAt = new Date();
        order.estimatedDelivery = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
        order.paymentFailureReason = undefined;
        
        await order.save({session});
        
        await session.commitTransaction();
        
        return res.status(200).json({success: true, message: 'payment successful, order confirmed', orderId: order.orderId});
        
    } catch (error) {
        await session.abortTransaction();
        console.error('error retrying payment:', error);
        return res.status(500).json({success: false, message: error.message || 'error processing payment'});
    } finally {
        session.endSession();
    }
};


module.exports = {
    loadCheckout,
    getWalletBalance,
    getCoupons,
    applyCoupon,
    createRazorpayOrder,
    verifyPayment,
    placeOrder,
    placeFailedPaymentOrder,
    retryPayment
}



//for razor pay X testing
// 1 - Use Razorpay test cards:

// Card: 4111 1111 1111 1111 or 5089 9214 5806 3914
// CVV: Any 3 digits
// Expiry: Any future date
// Name: Any name

// 2 - For UPI: Use success@razorpay for successful payment

// 3 - For testing failure: Use fail@razorpay for UPI or decline the payment