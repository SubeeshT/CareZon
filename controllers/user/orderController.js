const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const path = require('path');
const { getVariantLabel } = require('../../utils/variantAttribute');
const { default: mongoose } = require('mongoose');

const loadOrdersList = async (req, res) => {
    try {
        const userId = req.session.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;44
        const skip = (page - 1) * limit;
        const search = req.query.search?.trim() || '';
        const status = req.query.status || 'all';
 
        let searchQuery = { userId };
        if (search) {
            searchQuery.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { 'items.productSnapshot.name': { $regex: search, $options: 'i' } }
            ];
        }

        if (status && status !== 'all') {
            searchQuery.orderStatus = status;
        }
        
        const orders = await Order.find(searchQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(); 
        const totalOrders = await Order.countDocuments(searchQuery);
        
        //variant labels to order items 
        if (orders && orders.length > 0) {
            orders.forEach(order => {
                if (order.items) {
                    order.items.forEach(item => {
                        const categoryName = item.productSnapshot.category.name;
                        const variant = {attributes: item.productSnapshot.variantDetails.attributes};

                        if (variant && categoryName) {
                            item.variantLabel = getVariantLabel(variant, categoryName);
                        }
                    });
                }
            });
        }
        
        //create pagination object
        const pagination = {
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            hasNextPage: page < Math.ceil(totalOrders / limit),
            hasPrevPage: page > 1
        };

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            //transform data for json response if the req is ajax
            const transformedOrders = orders.map(order => ({
                orderId: order.orderId,
                orderDate: new Date(order.createdAt).toLocaleDateString(),
                status: order.orderStatus,
                returnRequestStatus: order.returnRequestStatus || 'none',
                totalAmount: order.totalAmount,
                products: order.items.map(item => ({
                    name: item.productSnapshot.name,
                    brand: item.productSnapshot.brand || 'N/A',
                    variant: item.variantLabel || 'N/A',
                    quantity: item.quantity,
                    price: item.unitPrice,
                    total: item.totalPrice,
                    image: item.productSnapshot.variantDetails.images && item.productSnapshot.variantDetails.images.length > 0 ? 
                        item.productSnapshot.variantDetails.images[0].url : '/user/images/logo.png'
                }))
            }));

            return res.json({success: true, orders: transformedOrders, pagination: pagination});
        }
        
        return res.status(200).render('account/ordersList', {activePage: 'orders', orders: orders, pagination: pagination, search: search});
        
    } catch (error) {
        console.error('Error loading orders list:', error);

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({success: false, message: 'Error loading orders'});
        }

        return res.status(500).render('pageNotFound', {success: false, statusCode: 500, message: "Error loading orders page"});
    }
};

const loadOrderedProductsDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId }).populate('userId', 'name email').lean();
        
        if (!order) {
            return res.status(404).render('pageNotFound', {success: false, statusCode: 404, message: "Order not found"});
        }

        //variant labels to order items
        order.items.forEach(item => {
            const categoryName = item.productSnapshot.category.name;  
            const variant = {
                attributes: item.productSnapshot.variantDetails.attributes
            };
            if (variant && categoryName) {
                item.variantLabel = getVariantLabel(variant, categoryName);
            }

            item.displayStatus = item.status || 'active';
        });
        
        return res.status(200).render('account/orderedProductsDetails', {activePage: 'orders', success: true, order: order});

    } catch (error) {
        console.error('Error loading order details:', error);
        return res.status(500).render('pageNotFound', {success: false, statusCode: 500, message: "Error loading order details"});
    }
}

const cancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        
        const { orderId } = req.params;
        const { reason, cancelType, itemId } = req.body;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId }).session(session);
        
        if (!order) {
            return res.status(404).json({success: false, message: 'Order not found'});
        }
        
        if (!['pending', 'confirmed', 'processing'].includes(order.orderStatus)) {
            return res.status(400).json({success: false, message: 'Order cannot be cancelled at this order status stage'});
        }
        
        if (cancelType === 'entire_order') { //cancel entire order    
            for (const item of order.items) {
                if (item.status !== 'cancelled') {
                    await Product.updateOne(
                        { 
                            "_id": item.productId, "variants._id": item.variantId
                        },
                        { 
                            $inc: { "variants.$.stock": item.quantity }
                        },
                        { session }
                    );

                    item.status = 'cancelled';
                    item.cancelledAt = new Date();
                    item.cancellationReason = reason;
                    item.cancelledBy = 'user';
                }
            }
            
            order.orderStatus = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = reason;
            order.cancelledBy = 'user';
            order.paymentStatus = 'refunded';
            
            await order.save({ session });
            
            //process refund for entire order cancellation
            if (order.paymentMethod !== 'cod' || order.paymentStatus === 'completed') {
                let refundAmount = order.totalAmount;
                
                const wallet = await Wallet.findOne({ userId }).session(session);
                let previousRefunds = 0;
                
                if (wallet) {//calculate total already refunded for this order (both cancel and return refunds)
                    previousRefunds = wallet.transactions.filter(t => 
                            t.orderId && 
                            t.orderId.toString() === order._id.toString() && 
                            (t.moneyFrom === 'cancelRefund' || t.moneyFrom === 'returnRefund') && 
                            t.status === 'success'
                        )
                        .reduce((sum, t) => sum + t.amount, 0);
                }
                refundAmount = refundAmount - previousRefunds;
                
                if (refundAmount <= 0) refundAmount = 0;
                  
                //restore coupon usage if coupon was applied
                if (order.couponApplied && order.couponApplied.couponId) {
                    const coupon = await Coupon.findById(order.couponApplied.couponId).session(session);
                    if (coupon) {
                        const userUsageIndex = coupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
                        if (userUsageIndex >= 0 && coupon.usedBy[userUsageIndex].usageCount > 0) {
                            coupon.usedBy[userUsageIndex].usageCount -= 1;
                            await coupon.save({ session });
                        }
                    }
                }
                
                //refund to wallet only if amount > 0
                if (refundAmount > 0) {
                    await Wallet.findOneAndUpdate(
                        { userId },
                        {
                            $inc: { balance: refundAmount, totalCredits: refundAmount },
                            $push: {
                                transactions: {
                                    direction: 'credit',
                                    status: 'success',
                                    moneyFrom: 'cancelRefund',
                                    paymentMethod: order.paymentMethod,
                                    amount: refundAmount,
                                    orderId: order._id,
                                    description: `refund for cancelled order ${order.orderId}`,
                                    date: new Date()
                                }
                            }
                        },
                        { session, upsert: true }
                    );
                }
            };
            
        } else if (cancelType === 'single_item') { //cancel single item
    
            const itemToCancel = order.items.find(item => item._id.toString() === itemId);
            
            if (!itemToCancel) {
                return res.status(404).json({success: false, message: 'Item not found in order'});
            }
            if (itemToCancel.status === 'cancelled') {
                return res.status(400).json({success: false, message: 'item is already cancelled'});
            }
            
            await Product.updateOne( //restore stock for cancelled item
                { 
                    "_id": itemToCancel.productId, "variants._id": itemToCancel.variantId
                },
                { 
                    $inc: { "variants.$.stock": itemToCancel.quantity }
                },
                { session }
            );
            
            itemToCancel.status = 'cancelled';
            itemToCancel.cancelledAt = new Date();
            itemToCancel.cancellationReason = reason;
            itemToCancel.cancelledBy = 'user';
            
            //check if all items are cancelled as single items
            const activeItems = order.items.filter(item => item.status !== 'cancelled');
            if (activeItems.length === 0) {
                order.orderStatus = 'cancelled';
                order.cancelledAt = new Date();
                order.cancellationReason = 'All items were cancelled';
                order.cancelledBy = 'user';
                order.paymentStatus = 'refunded';
            }
            
            await order.save({ session });
            
            //process refund for single item cancellation
            if (order.paymentMethod !== 'cod' || order.paymentStatus === 'completed') {
                let refundAmount = 0;
                let shouldRestoreCoupon = false;
                let shouldRefundDeliveryFee = false;
                
                //calculate remaining active items total
                const remainingActiveItems = order.items.filter(item => item.status !== 'cancelled' && item.status !== 'returned');
                const remainingSubtotal = remainingActiveItems.reduce((sum, item) => sum + item.totalPrice, 0);
                
                //check if this is the last active item being cancelled
                if (remainingActiveItems.length === 0) {
                    shouldRefundDeliveryFee = true;
                }
                
                //check coupon eligibility after cancellation
                if (order.couponApplied && order.couponApplied.couponId) {
                    const minPurchaseValue = order.couponApplied.minPurchaseValue;
                    
                    if (remainingSubtotal < minPurchaseValue) {//coupon eligibility broken
                        shouldRestoreCoupon = true;
                        
                        if (remainingSubtotal === 0) {//check if this is the last remaining item 
                            if (order.couponRestored) {
                                refundAmount = itemToCancel.totalPrice;
                            } else {
                                refundAmount = itemToCancel.finalPriceAfterDiscount || itemToCancel.totalPrice;
                            }
                        } else {//not the last item - deduct remaining active items' discount
                            const stillActiveItems = order.items.filter(item => 
                                item.status !== 'cancelled' && item.status !== 'returned' && item._id.toString() !== itemToCancel._id.toString());

                            const activeItemsDiscount = stillActiveItems.reduce((sum, item) => sum + (item.discountShare || 0), 0);

                            refundAmount = (itemToCancel.finalPriceAfterDiscount || itemToCancel.totalPrice) - activeItemsDiscount;
                        
                            if (refundAmount < 0) refundAmount = 0;
                        }
                    } else {
                        refundAmount = itemToCancel.finalPriceAfterDiscount || itemToCancel.totalPrice;
                    }
                } else {
                    refundAmount = itemToCancel.finalPriceAfterDiscount || itemToCancel.totalPrice;
                }
                
                //add delivery fee to refund if this is the last item being cancelled
                if (shouldRefundDeliveryFee && order.deliveryFee > 0) {
                    refundAmount += order.deliveryFee;
                }
                
                //restore coupon usage if eligibility broken
                if (shouldRestoreCoupon) {
                    const coupon = await Coupon.findById(order.couponApplied.couponId).session(session);
                    if (coupon) {
                        const userUsageIndex = coupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
                        if (userUsageIndex >= 0 && coupon.usedBy[userUsageIndex].usageCount > 0) {
                            coupon.usedBy[userUsageIndex].usageCount -= 1;
                            await coupon.save({ session });
                            order.couponRestored = true;  
                            order.discount = 0;
                            order.couponApplied.discountValue = 0;
                            for(let item of order.items){
                                item.discountShare = 0;
                                item.finalPriceAfterDiscount = 0;
                            }
                            await order.save({ session });  
                        }
                    }
                }
                                
                //add refund to wallet
                if (refundAmount > 0) {
                    await Wallet.findOneAndUpdate(
                        {userId},
                        {
                            $inc: { balance: refundAmount, totalCredits: refundAmount },
                            $push: {
                                transactions: {
                                    direction: 'credit',
                                    status: 'success',
                                    moneyFrom: 'cancelRefund',
                                    paymentMethod: order.paymentMethod,
                                    amount: refundAmount,
                                    orderId: order._id,
                                    description: `refund for cancelled item in order ${order.orderId}${shouldRestoreCoupon ? ' (coupon eligibility broken)' : ''}${shouldRefundDeliveryFee ? ' (includes delivery fee)' : ''}`,
                                    date: new Date()
                                }
                            }
                        },
                        { session, upsert: true }
                    );
                }
            }
        }
        
        await session.commitTransaction();
        
        const message = cancelType === 'entire_order' ? 'Entire order cancelled successfully' : 'Item cancelled successfully';
            
        return res.status(200).json({success: true, message});
        
    } catch (error) {
        await session.abortTransaction();
        console.error('Error while cancelling order:', error);
        return res.status(500).json({success: false, message: 'Error while cancelling order'});
    } finally {
        session.endSession();
    }
};

const returnOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason, description, returnType, itemId } = req.body;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId });
        
        if (!order) {
            return res.status(404).json({success: false, message: 'Order not found'});
        }
        
        if (order.orderStatus !== 'delivered') {
            return res.status(400).json({success: false, message: 'Only delivered orders can be returned'});
        }
        
        //check 14-day return policy
        const deliveryDate = new Date(order.deliveredAt); 
        const currentDate = new Date();
        const daysDifference = Math.ceil((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));
        
        if (daysDifference > 14) {
            return res.status(400).json({success: false, message: 'Return period has expired. Orders can only be returned within 14 days of delivery.'});
        }
        
        if (!reason || reason.trim() === '') {
            return res.status(400).json({success: false, message: 'Return reason is required'});
        }
        
        if(returnType === 'entire_order'){//Return entire order
            if(order.returnRequestStatus === 'rejected'){
                return res.status(400).json({success: false, message: 'Return request was already rejected. Cannot request return again.'});
            }

            if(order.returnRequestStatus === 'pending'){
                return res.status(400).json({success: false, message: 'Return request is already pending for admin approval'});
            }

            for(const item of order.items){
                if(item.status !== 'returned' && item.status !== 'cancelled'){//update order return request status only if already not cancelled and returned
                    item.returnRequestStatus = 'pending';
                    item.returnRequestedAt = new Date();
                    item.returnReason = reason;
                    item.returnedBy = 'user';
                }
            }
            //update order return request status
            order.returnRequestStatus = 'pending';
            order.returnRequestedAt = new Date();
            order.returnReason = reason;
            order.returnedBy = 'user';
            if (description) {
                order.adminNotes = description;
            }
        }else if(returnType === 'single_item'){//return single item
            const itemToReturn = order.items.find(item => item._id.toString() === itemId);

            if(!itemToReturn){
                return res.status(404).json({success: false, message: 'Item not found in order'});
            }

            if(itemToReturn.status === 'cancelled'){
                return res.status(400).json({success: false, message: 'Cannot return already cancelled item'});
            }

            if(itemToReturn.returnRequestStatus === 'rejected'){
                return res.status(400).json({success: false, message: 'Return request for this item was already rejected. Cannot request return again.'});
            }

            if(itemToReturn.returnRequestStatus === 'pending'){
                return res.status(400).json({success: false, message: 'Return request for this item is already pending admin approval'});
            }

            if(itemToReturn.returnRequestStatus === 'returned'){
                return res.status(400).json({success: false, message: 'Item is already returned'});
            }
            //update single item return request details
            itemToReturn.returnRequestStatus = 'pending';
            itemToReturn.returnRequestedAt = new Date();
            itemToReturn.returnReason = reason;
            itemToReturn.returnedBy = 'user';

            //if the other all items returnRequestStatus if pending/accepted and items status if returned/cancelled it will apply returnRequestStatus pending(order level)
            const allPending = order.items.every(item => item.returnRequestStatus === 'pending' || item.returnRequestStatus === 'accepted' || item.status === 'returned' || item.status === 'cancelled');
            if(allPending){
                order.returnRequestStatus = 'pending';
                order.returnRequestedAt = new Date();
                order.returnReason = 'All items are under return request';
                order.returnedBy = 'user';
            }

            if (description) {
                order.adminNotes = description;
            }
        }
        await order.save();
        
        const message = returnType === 'entire_order' ? 'Return request for entire order submitted successfully' : 'Return request submitted successfully';
            
        return res.status(200).json({success: true, message});
        
    } catch (error) {
        console.error('Error processing return:', error);
        return res.status(500).json({success: false, message: 'Error processing return request'});
    }
};

const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId }).populate('userId', 'fullName email');
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        if (req.query.view === 'true') {
            return res.status(200).render('invoice/invoice', {order: order, printMode: true});
        }
        
        const templatePath = path.join(__dirname, '../../views/invoice/invoice.ejs');
        const html = await ejs.renderFile(templatePath, {order: order, printMode: true});
        
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            }
        });
        
        await browser.close();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${orderId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
        
    } catch (error) {
        console.error('Error generating invoice:', error);
        return res.status(500).json({ error: "Error generating invoice" });
    }
};


module.exports = {
    loadOrdersList,
    loadOrderedProductsDetails,
    cancelOrder,
    returnOrder,
    downloadInvoice,

};