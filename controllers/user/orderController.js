const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
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
        console.log("status is : " ,status)
        console.log("search is : " ,search)
 
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
                        const categoryName = item.productSnapshot.category;
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

        return res.status(500).render('pageNotFound', {status: 500, message: "Error loading orders page"});
    }
};

const loadOrderedProductsDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId }).populate('userId', 'name email').lean();
        
        if (!order) {
            return res.status(404).render('pageNotFound', {status: 404, message: "Order not found"});
        }

        //variant labels to order items
        if (order && order.items) {
            order.items.forEach(item => {
                const categoryName = item.productSnapshot.category;
                const variant = {
                    attributes: item.productSnapshot.variantDetails.attributes
                };
                if (variant && categoryName) {
                    item.variantLabel = getVariantLabel(variant, categoryName);
                }

                item.displayStatus = item.status || 'active';
            });
        }
        
        return res.status(200).render('account/orderedProductsDetails', {activePage: 'orders', success: true, order: order});

    } catch (error) {
        console.error('Error loading order details:', error);
        return res.status(500).render('pageNotFound', {status: 500, message: "Error loading order details"});
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
            
            await order.save({ session });
            
        } else if (cancelType === 'single_item') { //cancel single item
            
            const itemToCancel = order.items.find(item => item._id.toString() === itemId);
            
            if (!itemToCancel) {
                return res.status(404).json({success: false, message: 'Item not found in order'});
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
            }
            
            await order.save({ session });
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
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        
        const { orderId } = req.params;
        const { reason, description, returnType, itemId } = req.body;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId }).session(session);
        
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
        
        if (returnType === 'entire_order') { //Return entire order           
            for (const item of order.items) {
                if (item.status !== 'returned') { 
                    await Product.updateOne(
                        { 
                            "_id": item.productId, "variants._id": item.variantId
                        },
                        { 
                            $inc: {"variants.$.stock": item.quantity}
                        },
                        { session }
                    );

                    item.status = 'returned';
                    item.cancelledAt = new Date();
                    item.cancellationReason = reason;
                    item.cancelledBy = 'user';
                }
            }
            
            // Update order status
            order.orderStatus = 'returned';
            order.returnedAt = new Date();
            order.returnReason = reason;
            order.returnedBy = 'user';
            if (description) {
                order.adminNotes = description;
            }
            
        } else if (returnType === 'single_item') {//return single item
            const itemToReturn = order.items.find(item => item._id.toString() === itemId);
            
            if (!itemToReturn) {
                return res.status(404).json({success: false, message: 'Item not found in order'});
            }
            
            if (itemToReturn.status === 'cancelled') {
                return res.status(400).json({success: false, message: 'Cannot return a cancelled item'});
            }
            
            if (itemToReturn.status === 'returned') {
                return res.status(400).json({success: false, message: 'Item is already returned'});
            }
            
            //restore stock for returned item
            await Product.updateOne(
                { 
                    "_id": itemToReturn.productId, "variants._id": itemToReturn.variantId
                },
                { 
                    $inc: {"variants.$.stock": itemToReturn.quantity}
                },
                { session }
            );
            
            //return info to the item
            itemToReturn.status = 'returned';
            itemToReturn.returnedAt = new Date();
            itemToReturn.returnReason = reason;
            itemToReturn.returnedBy = 'user';
            
            //check all items are returned
            const activeItems = order.items.filter(item => item.status === 'active');
            if (activeItems.length === 0) {
                order.orderStatus = 'returned';
                order.returnedAt = new Date();
                order.returnReason = 'All items returned';
                order.returnedBy = 'user';
            }
        }
        
        await order.save({ session });
        await session.commitTransaction();
        
        const message = returnType === 'entire_order' ? 'Return request for entire order submitted successfully' : 'Return request submitted successfully';
            
        return res.status(200).json({success: true, message});
        
    } catch (error) {
        await session.abortTransaction();
        console.error('Error processing return:', error);
        return res.status(500).json({success: false, message: 'Error processing return request'});
    } finally {
        session.endSession();
    }
};

const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId }).populate('userId', 'name email');
        
        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }
        
        //for view invoice
        if (req.query.view === 'true') {
            return res.status(200).render('invoice/invoice', {order: order, printMode: true});
        }
        
        //for download 
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${orderId}.html"`);
        return res.status(200).render('invoice/invoice', {order: order, printMode: true});
        
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