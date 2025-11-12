const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Wallet = require('../../models/walletSchema')
const { default: mongoose } = require('mongoose');

const loadOrder = async (req,res) => {
    try {
        const search = req.query.search?.trim() || '';
        const filter = req.query.filter?.trim() || '';
        const returnFilter = req.query.returnFilter?.trim() || ''; //only for return requests
        const sort = req.query.sort?.trim() || 'desc';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const searchFilter = {};

        if(search){
            const users = await User.find({fullName: {$regex: search, $options: 'i'}}, '_id');
            const userIds = users.map(user => user._id);//user search name to _id, direct in order collection

            searchFilter.$or = [{orderId: {$regex: search, $options: 'i'}}, {userId: {$in: userIds}}]
        }

        if(filter){
            searchFilter.orderStatus = filter;
        }

        if(returnFilter === 'pending'){//filer return requests
            searchFilter.$or = [
                { returnRequestStatus: 'pending' },
                { 'items.returnRequestStatus': 'pending' }
            ];
        }

        const sorted = sort === 'desc'? -1 : 1;

        const orders = await Order.find(searchFilter).sort({createdAt: sorted}).skip(skip).limit(limit).populate('userId', 'fullName email');

        const totalOrders = await Order.countDocuments(searchFilter);

        const pagination = {
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            hasNextPage: page < Math.ceil(totalOrders / limit),
            hasPrevPage: page > 1,
            totalOrders
        }

        const totalRevenueResult = await Order.aggregate([
            {$match: {orderStatus: {$nin: ['cancelled', 'returned']}}},
            {$group: {_id: null, total: {$sum: '$totalAmount'}}}
        ]);

        const stats = {
            totalOrders: await Order.countDocuments(),
            returnRequests: await Order.countDocuments({'items.returnRequestStatus': 'pending'}),
            totalRevenue: totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0
        };

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(200).json({success: true, orders, pagination});
        }      

        return res.status(200).render('admin/order/orders', {orders, pagination, stats: {...stats}});

    } catch (error) {
        console.error("Internal error get while loading orders : ", error);
        return res.status(500).json({success: false, message: "Internal error, cant load orders"});
    }
}

const updateOrderStatus = async (req,res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction()

        const id = req.params.id;
        const { orderStatus }= req.body; 

        const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'out for delivery', 'delivered', 'cancelled'] //'returned'
        if(!statuses.includes(orderStatus)){
            await session.abortTransaction();
            return res.status(400).json({success: false, message: 'Please select a valid status'});
        }

        const order = await Order.findById(id).session(session);
        if(!order){
            await session.abortTransaction();
            return res.status(404).json({success: false, message: "Order not found"});
        }

        const currentOrderStatus = order.orderStatus;
        if (currentOrderStatus === 'cancelled' || currentOrderStatus === 'returned') {
            await session.abortTransaction();
            return res.status(400).json({success: false, message: "This item is already cancelled or returned"});
        }

        switch (orderStatus) { //set timestamps based on status
            case 'confirmed':
                order.confirmedAt = new Date();
                break;
            case 'shipped':
                order.shippedAt = new Date();
                break;
            case 'delivered':
                order.deliveredAt = new Date();
                order.paymentStatus = 'completed';
                break;
            case 'out for delivery':
                order.outForDeliveryAt = new Date();
                break;
            case 'cancelled':
                order.cancelledAt = new Date();
                order.cancelledBy = 'admin';
                break;
        }

        if(orderStatus === 'cancelled'){ //handle cancellation, restore stock for all items
            const {reason} = req.body;

            if(order.orderStatus === 'cancelled'){
                await session.abortTransaction();
                return res.status(400).json({success: false, message: `order already cancelled by ${order.items.cancelledBy}`});
            }

            for(let item of order.items){
                if (item.status !== 'cancelled' && item.status !== 'returned') {
                    await Product.updateOne(
                        {_id: item.productId, 'variants._id': item.variantId},
                        {$inc: {'variants.$.stock': item.quantity}},
                        {session}
                    )

                    item.status = 'cancelled';
                    item.cancelledAt = new Date();
                    item.cancellationReason = reason || 'Cancelled by admin';
                    item.cancelledBy = 'admin'
                }
            }
            order.cancellationReason = reason || 'Cancelled by admin';
            order.paymentStatus = 'refunded';
            
            //process refund for admin cancellation
            if (order.paymentMethod !== 'cod' || order.paymentStatus === 'completed') {
                const userId = order.userId;
                
                let refundAmount = order.totalAmount;
                
                //get wallet to check previous refunds for this order
                const wallet = await Wallet.findOne({ userId }).session(session);
                let previousRefunds = 0;
                
                if (wallet) {
                    //calculate total already refunded for this order (both cancel and return refunds)
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
                if (order.couponApplied && order.couponApplied.couponId && previousRefunds === 0) {
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
                                    description: `refund for order ${order.orderId} cancelled by admin`,
                                    date: new Date()
                                }
                            }
                        },
                        { session, upsert: true }
                    );
                }
            }
        } 

        order.orderStatus = orderStatus.trim();
        
        await order.save({session});
        await session.commitTransaction();

        return res.status(200).json({success: true, message: `order status change to ${orderStatus}`});
        
    } catch (error) {
        await session.abortTransaction();
        console.error('internal error get while updating status : ', error);
        return res.status(500).json({success: false, message: "Internal error get while updating status"});
    } finally{
        session.endSession();
    }
}

const updateReturnOrder = async (req,res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();
 
        const id = req.params.id;
        const {action, itemIds, rejectedItemIds, rejectionReason} = req.body;

        const order = await Order.findById(id).session(session);
        if(!order){
            await session.abortTransaction();
            return res.status(404).json({success: false, message: "order not found"});
        }

        //check 14-day return policy
        const deliveryDate = new Date(order.deliveredAt); 
        const currentDate = new Date();
        const daysDifference = Math.ceil((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));
        
        if (daysDifference > 14) {
            await session.abortTransaction();
            return res.status(400).json({success: false, message: 'Return period has expired. Orders can only be returned within 14 days of delivery.'});
        }

        if(!action || !['accept', 'reject'].includes(action)){
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Valid action (accept/reject) is required" });
        }

        if(!itemIds || !Array.isArray(itemIds) || itemIds.length === 0){
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Item IDs are required" });
        }

        let acceptedItems = [];
        let rejectedItems = [];

        if(action === 'accept'){ //handle acceptance with optional partial rejection
            const itemsToAccept = itemIds.filter(id => !rejectedItemIds?.includes(id));
            const itemsToReject = rejectedItemIds || [];

            for(const itemId of itemsToAccept){//process accepted items
                const item = order.items.find(item => item._id.toString() === itemId);

                if(!item){
                    await session.abortTransaction();
                    return res.status(404).json({ success: false, message: `Item ${itemId} not found in order` });
                }

                if(item.status === 'cancelled'){
                    await session.abortTransaction();
                    return res.status(400).json({ success: false, message: 'Cannot return a cancelled item' });
                }

                if(item.returnRequestStatus !== 'pending'){
                    await session.abortTransaction();
                    return res.status(400).json({ success: false, message: `Item ${itemId} has no pending return request` });
                }

                if(item.status === 'returned'){
                    await session.abortTransaction();
                    return res.status(400).json({ success: false, message: `Item ${itemId} has already returned` });
                }

                await Product.updateOne( //restore stock for accepted return items
                    {_id: item.productId, 'variants._id': item.variantId},
                    {$inc: {'variants.$.stock': item.quantity}}, {session}
                );

                item.status = 'returned';
                item.returnedAt = new Date();
                item.returnedBy = 'admin';
                item.returnRequestStatus = 'accepted';

                acceptedItems.push(item);
            }

            for(const itemId of itemsToReject){
                const item = order.items.find(item => item._id.toString() === itemId.toString());
                
                if(!item){
                    await session.abortTransaction();
                    return res.status(404).json({ success: false, message: `Item ${itemId} not found in order` });
                }
                
                if(item.returnRequestStatus === 'pending'){
                    item.returnRequestStatus = 'rejected';
                    item.rejectionReason = rejectionReason?.trim() || 'Return rejected by admin';
                    rejectedItems.push(item);
                }
            }
        }else if(action === 'reject'){//reject all specified items
            for(const itemId of itemIds){
                const item = order.items.find(item => item._id.toString() === itemId);

                if(!item){
                    await session.abortTransaction();
                    return res.status(404).json({ success: false, message: `Item ${itemId} not found in order` });
                }

                if(item && item.returnRequestStatus === 'pending'){
                    item.returnRequestStatus = 'rejected';
                    item.rejectionReason = rejectionReason.trim() || 'Return rejected by admin';
                    rejectedItems.push(item);
                }
            }
            //update order return request status if all items rejected
            const hasPendingReturns = order.items.some(item => item.returnRequestStatus === 'pending');
            if(!hasPendingReturns){
                order.returnRequestStatus = 'rejected';
                order.rejectionReason = rejectionReason.trim();
            }
        }

        //count items by status
        const activeItems = order.items.filter(item => item.status === 'active');
        const returnedItems = order.items.filter(item => item.status === 'returned');
        const cancelledItems = order.items.filter(item => item.status === 'cancelled');

        //check if all non-cancelled items are returned 
        const nonCancelledItems = order.items.filter(item => item.status !== 'cancelled');
        const allNonCancelledReturned = nonCancelledItems.length > 0 && 
                                        nonCancelledItems.every(item => item.status === 'returned');

        if(allNonCancelledReturned){
            //all items (except cancelled) are returned
            order.orderStatus = 'returned';
            order.returnedAt = new Date();
            order.returnReason = 'All items returned and accepted';
            order.returnedBy = 'admin';
            order.paymentStatus = 'refunded';
            order.returnRequestStatus = 'accepted';
        } else if(returnedItems.length > 0){
            //partial return
            order.returnReason = `Partial return - ${returnedItems.length} of ${nonCancelledItems.length} items returned`;
            order.returnRequestStatus = 'accepted';
        }

        await order.save({ session });

        //process refunds for accepted return items
        if (acceptedItems.length > 0) {
            const userId = order.userId;
            
            const allItemsReturned = order.items.every(item => item.status === 'returned' || item.status === 'cancelled');
            
            if (allItemsReturned) {
                let refundAmount = order.totalAmount - order.deliveryFee; 
                
                //get wallet to check previous refunds for this order
                const wallet = await Wallet.findOne({ userId }).session(session);
                let previousRefunds = 0;
                
                if (wallet) { //calculate total already refunded for this order (both cancel and return)
                    previousRefunds = wallet.transactions.filter(t => 
                            t.orderId && 
                            t.orderId.toString() === order._id.toString() && 
                            (t.moneyFrom === 'cancelRefund' || t.moneyFrom === 'returnRefund') && 
                            t.status === 'success'
                        )
                        .reduce((sum, t) => sum + t.amount, 0);
                }
                refundAmount = refundAmount - previousRefunds;
                
                if (refundAmount < 0) refundAmount = 0;
                    
                    //restore coupon usage
                    if (order.couponApplied && order.couponApplied.couponId) {
                        const coupon = await Coupon.findById(order.couponApplied.couponId).session(session);
                        if (coupon) {
                            const userUsageIndex = coupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
                            if (userUsageIndex >= 0 && coupon.usedBy[userUsageIndex].usageCount > 0) {
                                coupon.usedBy[userUsageIndex].usageCount -= 1;
                                await coupon.save({ session });
                                order.couponRestored = true;
                                order.couponApplied.discountValue = 0;
                                order.discount = 0;
                                for(let item of order.items){
                                    item.discountShare = 0;
                                    item.finalPriceAfterDiscount = 0;
                                }
                            }
                        }
                    }
                    
                    if (refundAmount > 0) {
                        await Wallet.findOneAndUpdate(//refund add to wallet
                            { userId },
                            {
                                $inc: {balance: refundAmount, totalCredits: refundAmount},
                                $push: {
                                    transactions: {
                                        direction: 'credit',
                                        status: 'success',
                                        moneyFrom: 'returnRefund',
                                        paymentMethod: order.paymentMethod,
                                        amount: refundAmount,
                                        orderId: order._id,
                                        description: `refund for returned order ${order.orderId} (delivery fee excluded)`,
                                        date: new Date()
                                    }
                                }
                            },
                            { session, upsert: true }
                        );
                    }
                } else {
                    //partial return, calculate refund per item
                    for (const returnedItem of acceptedItems) {
                        let refundAmount = 0;
                        let shouldRestoreCoupon = false;
                        
                        //calculate remaining active items
                        const remainingActiveItems = order.items.filter(item => item.status !== 'cancelled' && item.status !== 'returned');
                        const remainingSubtotal = remainingActiveItems.reduce((sum, item) => sum + item.totalPrice, 0);
                        
                        //check coupon eligibility
                        if (order.couponApplied && order.couponApplied.couponId) {
                            const minPurchaseValue = order.couponApplied.minPurchaseValue;
                            
                            if (remainingSubtotal < minPurchaseValue) {//coupon eligibility broken
                                shouldRestoreCoupon = true;
                                
                                if (remainingSubtotal === 0) {//check if this is the last remaining item 
                                    if (order.couponRestored) {
                                        refundAmount = returnedItem.totalPrice;
                                    } else {
                                        refundAmount = returnedItem.finalPriceAfterDiscount || returnedItem.totalPrice;
                                    }
                                } else {//not the last item - deduct remaining active items' discount
                                    const stillActiveItems = order.items.filter(item => 
                                        item.status !== 'cancelled' && item.status !== 'returned' && item._id.toString() !== returnedItem._id.toString());

                                    const activeItemsDiscount = stillActiveItems.reduce((sum, item) => sum + (item.discountShare || 0), 0);

                                    refundAmount = (returnedItem.finalPriceAfterDiscount || returnedItem.totalPrice) - activeItemsDiscount;
                                
                                    if (refundAmount < 0) refundAmount = 0;
                                }
                            } else {
                                refundAmount = returnedItem.finalPriceAfterDiscount || returnedItem.totalPrice;
                            }
                        } else { //no coupon                    
                            refundAmount = returnedItem.finalPriceAfterDiscount || returnedItem.totalPrice;
                            
                        }
                        
                        //restore coupon (only once for first item that breaks eligibility)
                        if (shouldRestoreCoupon && !order.couponRestored) {
                            const coupon = await Coupon.findById(order.couponApplied.couponId).session(session);
                            if (coupon) {
                                const userUsageIndex = coupon.usedBy.findIndex(u => u.userId.toString() === userId.toString());
                                if (userUsageIndex >= 0 && coupon.usedBy[userUsageIndex].usageCount > 0) {
                                    coupon.usedBy[userUsageIndex].usageCount -= 1;
                                    await coupon.save({ session });
                                    order.couponRestored = true;
                                    order.couponApplied.discountValue = 0;
                                    order.discount = 0;
                                    for(let item of order.items){
                                        item.discountShare = 0;
                                        item.finalPriceAfterDiscount = 0;
                                    }
                                    await order.save({ session }); 
                                }
                            }
                        }
                          
                        if (refundAmount > 0) { //refund credit to wallet
                            await Wallet.findOneAndUpdate(
                                { userId },
                                {
                                    $inc: { balance: refundAmount, totalCredits: refundAmount },
                                    $push: {
                                        transactions: {
                                            direction: 'credit',
                                            status: 'success',
                                            moneyFrom: 'returnRefund',
                                            paymentMethod: order.paymentMethod,
                                            amount: refundAmount,
                                            orderId: order._id,
                                            description: `refund for returned item in order ${order.orderId}${shouldRestoreCoupon ? ' (Coupon eligibility broken)' : ''} (delivery fee excluded)`,
                                            date: new Date()
                                        }
                                    }
                                },
                                { session, upsert: true }
                            );
                        }
                    }
                }
        }
        await session.commitTransaction();

        let message = '';
        if (action === 'accept') {
            if (rejectedItems.length > 0) {
                message = `Return processed: ${acceptedItems.length} items accepted, ${rejectedItems.length} items rejected`;
            } else {
                message = `Return accepted for ${acceptedItems.length} items`;
            }
        } else if(action === 'reject'){
            message = `Return rejected for ${rejectedItems.length} items`;
        }
            
        return res.status(200).json({success: true, message, acceptedCount: acceptedItems.length, rejectedCount: rejectedItems.length});
        
    } catch (error) {
        await session.abortTransaction();
        console.error("internal error get while return order : ", error);
        return res.status(500).json({success: false, message: "Internal error while return order"});
    } finally{
        session.endSession()
    }
}

const orderFullDetails = async (req,res) => {
    try {
        const id = req.params.id;

        const order = await Order.findById(id)
            .populate('userId', 'fullName email phone DOB gender imageURL')
            .populate({path: 'items.productId', select: 'name brand category variants', 
            populate: [{path: 'brand', select: 'name'}, {path: 'category', select: 'name'}]
            });

        if(!order){
            return res.status(404).json({success: false, message: "order not found"});
        }

        const orderSummary = { //calculate order summary
            totalItems: order.items.length,
            activeItems: order.items.filter(item => item.status === 'active').length,
            cancelledItems: order.items.filter(item => item.status === 'cancelled').length,
            returnedItems: order.items.filter(item => item.status === 'returned').length,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            totalAmount: order.totalAmount
        }
        
        if (req.headers.accept && req.headers.accept.includes('application/json')) {//ajax response
            return res.status(200).json({success: true, order, orderSummary});
        }

        return res.status(200).render('admin/order/orderDetails', {order, orderSummary});

    } catch (error) {
        console.error("Internal error while loading order details: ", error);
        return res.status(500).json({ success: false, message: "Internal error while loading order details" });
    }
}

module.exports = {
    loadOrder,
    updateOrderStatus,
    updateReturnOrder,
    orderFullDetails
}