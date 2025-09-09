const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');
const { getVariantLabel } = require('../../utils/variantAttribute');
const { default: mongoose } = require('mongoose');

const placeOrder = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        
        const { addressId, paymentMethod, orderedItems } = req.body;
        const userId = req.session.userId;
        
        // Validate input
        if (!addressId || !paymentMethod || !orderedItems || orderedItems.length === 0) {
            return res.status(400).json({success: false, message: 'Missing required order information'});
        }
        
        // Get address details
        const address = await Address.findOne({ _id: addressId, userId }).session(session);
        if (!address) {
            return res.status(404).json({success: false,message: 'Address not found'});
        }
        
        // Validate cart and get current product details
        const cart = await Cart.findOne({ userId }).populate({path: 'items.productId', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }]}).session(session);
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({success: false, message: 'Cart is empty'});
        }
        
        // Prepare order items with stock validation
        const orderItems = [];
        let subtotal = 0;
        const stockUpdates = [];
        
        for (const orderedItem of orderedItems) {
            const cartItem = cart.items.find(item => 
                item.productId._id.toString() === orderedItem.productId.toString() &&
                item.variantId.toString() === orderedItem.variantId.toString()
            );
            
            if (!cartItem) {
                throw new Error(`Item not found in cart: ${orderedItem.productId}`);
            }
            
            const product = cartItem.productId;
            const variant = product.variants.find(v => v._id.toString() === orderedItem.variantId.toString());
            
            if (!variant) {
                throw new Error(`Variant not found: ${orderedItem.variantId}`);
            }
            
            // Check stock availability
            if (variant.stock < orderedItem.quantity) {
                throw new Error(`Insufficient stock for ${product.name}. Available: ${variant.stock}, Requested: ${orderedItem.quantity}`);
            }
            
            // Prepare order item
            const orderItem = {
                productId: product._id,
                variantId: variant._id,
                quantity: orderedItem.quantity,
                unitPrice: variant.salesPrice,
                totalPrice: variant.salesPrice * orderedItem.quantity,
                productSnapshot: {
                    name: product.name,
                    brand: product.brand.name,
                    category: product.category.name,
                    variantDetails: {
                        uom: variant.uom,
                        attributes: variant.attributes,
                        images: variant.images.slice(0, 1)
                    }
                }
            };
            
            orderItems.push(orderItem);
            subtotal += orderItem.totalPrice;
            
            //prepare stock update
            stockUpdates.push({
                productId: product._id,
                variantId: variant._id,
                quantityToReduce: orderedItem.quantity
            });
        }
        
        //calculate delivery fee
        const deliveryFee = subtotal < 300 ? 50 : 0;
        const totalAmount = subtotal + deliveryFee;

        //Generate unique orderId
        const orderCount = await Order.countDocuments();
        const orderId = `ORD${Date.now()}${String(orderCount + 1).padStart(4, '0')}`;

        
        //Create order
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
            subtotal,
            deliveryFee,
            totalAmount,
            orderStatus: 'confirmed',
            confirmedAt: new Date()
        });
        
        await order.save({ session });
        
        //update product stock
        for (const update of stockUpdates) {
            await Product.updateOne(
                { 
                    "_id": update.productId,
                    "variants._id": update.variantId
                },
                { 
                    $inc: { 
                        "variants.$.stock": -update.quantityToReduce 
                    }
                },
                { session }
            );
        }
        
        //remove ordered items from cart (handle partial quantities)
        cart.items = cart.items.map(cartItem => {
            const orderedItem = orderedItems.find(ordered => 
                cartItem.productId._id.toString() === ordered.productId.toString() &&
                cartItem.variantId.toString() === ordered.variantId.toString()
            );
            
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
                //if full quantity was ordered, mark for removal
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
                estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        console.error('Error get while placing order:', error);
        return res.status(500).json({success: false, message: error.message || 'Error placing order'});
    } finally {
        session.endSession();
    }
};

const loadOrdersList = async (req, res) => {
    try {
        const userId = req.session.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
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
        
        const orders = await Order.find(searchQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        const totalOrders = await Order.countDocuments(searchQuery);
        
        //variant labels to order items 
        if (orders && orders.length > 0) {
            orders.forEach(order => {
                if (order.items) {
                    order.items.forEach(item => {
                        const categoryName = item.productSnapshot.category;
                        const variant = {
                            attributes: item.productSnapshot.variantDetails.attributes
                        };
                        if (variant && categoryName) {
                            item.variantLabel = getVariantLabel(variant, categoryName);
                        }
                    });
                }
            });
        }
        
        // Create pagination object
        const pagination = {
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            hasNextPage: page < Math.ceil(totalOrders / limit),
            hasPrevPage: page > 1
        };

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            // Transform data for json response
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
                    image: item.productSnapshot.variantDetails.images && 
                        item.productSnapshot.variantDetails.images.length > 0 ? 
                        item.productSnapshot.variantDetails.images[0].url : 
                        '/user/images/logo.png'
                }))
            }));

            return res.json({
                success: true,
                orders: transformedOrders,
                pagination: pagination
            });
        }
        
        return res.status(200).render('account/ordersList', {
            activePage: 'orders', 
            orders: orders,
            pagination: pagination,
            search: search
        });
        
    } catch (error) {
        console.error('Error loading orders list:', error);

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Error loading orders'
            });
        }

        return res.status(500).render('pageNotFound', {
            status: 500, 
            message: "Error loading orders page"
        });
    }
};

const loadOrderedProductsDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        const order = await Order.findOne({ orderId, userId })
            .populate('userId', 'name email')
            .lean();
        
        if (!order) {
            return res.status(404).render('pageNotFound', {
                status: 404, 
                message: "Order not found"
            });
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
        
        return res.status(200).render('account/orderedProductsDetails', {
            activePage: 'orders', 
            success: true,
            order: order
        });
    } catch (error) {
        console.error('Error loading order details:', error);
        return res.status(500).render('pageNotFound', {
            status: 500, 
            message: "Error loading order details"
        });
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
        
        if (!['pending', 'confirmed'].includes(order.orderStatus)) {
            return res.status(400).json({success: false, message: 'Order cannot be cancelled at this stage'});
        }
        
        if (cancelType === 'entire_order') {
            // Cancel entire order
            for (const item of order.items) {
                await Product.updateOne(
                    { 
                        "_id": item.productId,
                        "variants._id": item.variantId
                    },
                    { 
                        $inc: { 
                            "variants.$.stock": item.quantity 
                        }
                    },
                    { session }
                );
            }
            
            // Update order status
            order.orderStatus = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = reason;
            order.cancelledBy = 'user';
            
            await order.save({ session });
            
        } else if (cancelType === 'single_item') {
            // Cancel single item
            const itemToCancel = order.items.find(item => item._id.toString() === itemId);
            
            if (!itemToCancel) {
                return res.status(404).json({success: false, message: 'Item not found in order'});
            }
            
            // Restore stock for cancelled item
            await Product.updateOne(
                { 
                    "_id": itemToCancel.productId,
                    "variants._id": itemToCancel.variantId
                },
                { 
                    $inc: { 
                        "variants.$.stock": itemToCancel.quantity 
                    }
                },
                { session }
            );
            
            // Add cancellation info to the item
            itemToCancel.status = 'cancelled';
            itemToCancel.cancelledAt = new Date();
            itemToCancel.cancellationReason = reason;
            itemToCancel.cancelledBy = 'user';
            
            // Check if all items are cancelled
            const activeitems = order.items.filter(item => item.status !== 'cancelled');
            if (activeitems.length === 0) {
                order.orderStatus = 'cancelled';
                order.cancelledAt = new Date();
                order.cancellationReason = 'All items cancelled';
                order.cancelledBy = 'user';
            }
            
            await order.save({ session });
        }
        
        await session.commitTransaction();
        
        const message = cancelType === 'entire_order' ? 
            'Entire order cancelled successfully' : 
            'Item cancelled successfully';
            
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
        
        // Check 14-day return policy
        const deliveryDate = new Date(order.deliveredAt || order.createdAt); // fallback to createdAt if deliveredAt not set
        const currentDate = new Date();
        const daysDifference = Math.ceil((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));
        
        if (daysDifference > 14) {
            return res.status(400).json({success: false, message: 'Return period has expired. Orders can only be returned within 14 days of delivery.'});
        }
        
        if (!reason || reason.trim() === '') {
            return res.status(400).json({success: false, message: 'Return reason is required'});
        }
        
        if (returnType === 'entire_order') {
            // Return entire order
            for (const item of order.items) {
                if (item.status !== 'cancelled') { // Only return active items
                    await Product.updateOne(
                        { 
                            "_id": item.productId,
                            "variants._id": item.variantId
                        },
                        { 
                            $inc: { 
                                "variants.$.stock": item.quantity 
                            }
                        },
                        { session }
                    );
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
            
        } else if (returnType === 'single_item') {
            // Return single item
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
            
            // Restore stock for returned item
            await Product.updateOne(
                { 
                    "_id": itemToReturn.productId,
                    "variants._id": itemToReturn.variantId
                },
                { 
                    $inc: { 
                        "variants.$.stock": itemToReturn.quantity 
                    }
                },
                { session }
            );
            
            // Add return info to the item
            itemToReturn.status = 'returned';
            itemToReturn.returnedAt = new Date();
            itemToReturn.returnReason = reason;
            itemToReturn.returnedBy = 'user';
            
            // Check if all active items are returned
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
        
        const message = returnType === 'entire_order' ? 
            'Return request for entire order submitted successfully' : 
            'Return request submitted successfully';
            
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
        
        // For view invoice (HTML response)
        if (req.query.view === 'true') {
            return res.status(200).render('invoice/invoice', { 
                order: order,
                printMode: true 
            });
        }
        
        // For download (set headers for PDF download)
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice-${orderId}.html"`);
        return res.status(200).render('invoice/invoice', { 
            order: order,
            printMode: true 
        });
        
    } catch (error) {
        console.error('Error generating invoice:', error);
        return res.status(500).json({ error: "Error generating invoice" });
    }
};


module.exports = {
    placeOrder,
    loadOrdersList,
    loadOrderedProductsDetails,
    cancelOrder,
    returnOrder,
    downloadInvoice,

};