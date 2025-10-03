const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema')
const Address = require('../../models/addressSchema');
const Prescription = require('../../models/prescriptionSchema');
const Order = require('../../models/orderSchema');
const { getVariantLabel } = require('../../utils/variantAttribute');
const { default: mongoose } = require('mongoose');


const maxQuantityPerProduct = 10;

const loadCart = async (req,res) => {
    try {  
        let cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed'}]});
        if(!cart){ //If no cart exists, create an empty one
            cart = new Cart({
                userId: req.session.userId,
                items: [],
                totalAmount: 0
            });
            await cart.save();
        }
        //Filter out invalid items and update cart
        const validItems = [];
        let totalAmount = 0;
        let cartUpdated = false;

        for(const item of cart.items){
            const product = item.productId;

            if(!product || !product.brand || !product.category || !product.brand.isListed || !product.category.isListed){
                cartUpdated = true;
                continue; 
            }

            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if(!variant || !variant.isListed){
                cartUpdated = true;
                continue;
            }
           
            let stockIssue = false;
            if(variant.stock < item.quantity){
                stockIssue = true;
            }

            const subtotal = variant.salesPrice * item.quantity;

            validItems.push({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                subtotal: item.quantity > 0 ? subtotal : 0,
                stockIssue: stockIssue,
                availableStock: variant.stock
            });

            if(item.quantity > 0) {
                totalAmount += subtotal;
            }
        }
        //update cart if there were any changes
        if(cartUpdated){
            cart.items = validItems;
            cart.totalAmount = totalAmount;
            await cart.save();
        }

        //re populate for display
        cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed'}]});

        //variant labels to cart items for display (find from utils folder) = attributes
        if (cart && cart.items) {
            cart.items.forEach(item => {
                const product = item.productId;
                const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                if (variant && product.category) {
                    item.variantLabel = getVariantLabel(variant, product.category.name);
                }
            });
        }

        return res.status(200).render('cart/cartManagement', {success: true, cart, maxQuantity: maxQuantityPerProduct});

    } catch (error) {
        console.error("internal error get while load cart page : ", error);
        return res.status(500).render('pageNotFound', {success: false, message: "Error get while loading cart page, Try again"});
    }
}


const addToCart  = async (req,res) => {
    try {
        const {productId, variantId, quantity = 1} = req.body;

        if (!productId || !variantId || !mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
            return res.status(400).json({ success: false, message: 'Invalid product or variant ID' });
        }

        if (quantity < 1 || quantity > maxQuantityPerProduct) {
            return res.status(400).json({ success: false, message: `Quantity must be between 1 and ${maxQuantityPerProduct}` });
        }

        const product = await Product.findById(productId).populate('brand', '_id name isListed').populate('category', '_id name isListed');

        if (!product || !product.brand || !product.category || !product.brand.isListed || !product.category.isListed) {
            return res.status(400).redirect('/products/shop');
        }

        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (!variant || !variant.isListed) {
            return res.status(400).json({success: false, message: 'Product variant is not available'});
        }

        if (variant.stock < quantity) {
            return res.status(400).json({success: false, message: `Only ${variant.stock} items available in stock`});
        }

        //check prescription requirement for prescription-required products
        if (variant.prescriptionRequired) {
            if (!req.user || !req.session.userId) {
                return res.status(401).json({success: false, message: 'Please login first and upload prescription to add this item to cart',requiresAuth: true});
            }

            //check if user has valid prescription
            const prescription = await Prescription.findOne({
                userId: req.session.userId, productId: productId, variantId: variantId, status: 'Verified', expiryDate: { $gt: new Date() }
                }).sort({ createdAt: -1 }); 

            if (!prescription) {
                //check if theres any prescription and return appropriate message
                const anyPrescription = await Prescription.findOne({userId: req.session.userId, productId: productId, variantId: variantId}).sort({ createdAt: -1 });

                if (anyPrescription) {
                    switch(anyPrescription.status) {
                        case 'Pending':
                            return res.status(400).json({success: false, message: 'Your prescription is pending verification. Please wait for admin approval.'});
                        case 'Rejected':
                            return res.status(400).json({success: false, message: 'Your prescription was rejected. Please upload a new prescription.'});
                        case 'Expired':
                            return res.status(400).json({success: false, message: 'Your prescription has expired. Please upload a new prescription.'});
                        default:
                            return res.status(400).json({success: false, message: 'Please upload and verify your prescription before adding this item to cart'});
                    }
                } else {
                    return res.status(400).json({success: false,  message: 'Please upload and verify your prescription before adding this item to cart'});
                }
            }
            //check remaining UOM
            const usedUom = prescription.usedUom || 0;
            const remainingUom = prescription.uom - usedUom;
            
            if (remainingUom <= 0) {
                return res.status(400).json({success: false, message: 'Your prescription limit has been reached. Please upload a new prescription'});
            }

            if (quantity > remainingUom) {
                return res.status(400).json({success: false, message: `You can only add ${remainingUom} items based on your prescription`});
            }
        }
        //for non-prescription products, check if user is logged in
        if (!variant.prescriptionRequired && (!req.user || !req.session.userId)) {
            return res.status(401).json({success: false, message: 'Please login first to add items to cart', requiresAuth: true});
        }

        //Find or create cart
        let cart = await Cart.findOne({userId: req.session.userId});
        if(!cart){
            cart = new Cart({
                userId: req.session.userId,
                items: [],
                totalAmount: 0
            });
        }
        //Check if item already exists in cart
        const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId && item.variantId.toString() === variantId);

        if(existingItemIndex > -1){
            const existingItem = cart.items[existingItemIndex];
            const newQuantity = existingItem.quantity + quantity;

            if(newQuantity > maxQuantityPerProduct){
                return res.status(400).json({success: false, message: `Maximum ${maxQuantityPerProduct} items allowed per product`});
            }

            if (newQuantity > variant.stock) {
                return res.status(400).json({success: false, message: `Only ${variant.stock} items available in stock`});
            }

            existingItem.quantity = newQuantity;
            existingItem.subtotal = variant.salesPrice * newQuantity;
        }else{
            cart.items.push({
                productId,
                variantId,
                quantity,
                subtotal: variant.salesPrice * quantity
            });
        }

        cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);

        await cart.save();

        return res.status(200).json({success: true, message: 'Product added to cart successfully', cartItemsCount: cart.items.length});

    } catch (error) {
        console.error("internal Error adding to cart:", error);
        return res.status(500).json({ success: false, message: 'Internal server error while product add to the cart'});
    }
}


const removeFromCart = async (req,res) => {
    try {
        const {productId, variantId} =  req.body;
        if (!productId || !variantId || !mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
            return res.status(400).json({ success: false, message: 'Invalid product or variant ID' });
        }

        const cart = await Cart.findOne({userId: req.session.userId});
        if(!cart){
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }
        //remove item from cart
        cart.items = cart.items.filter(item => !(item.productId.toString() === productId && item.variantId.toString() === variantId));
        
        //recalculate total amount
        cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);

        await cart.save();

        return res.status(200).json({success: true, message: 'Product removed from cart', cartItemsCount: cart.items.length, totalAmount: cart.totalAmount});

    } catch (error) {
        console.error("internal error removing from cart:", error);
        return res.status(500).json({success: false, message: 'Internal server error while remove item from cart'});
    }
}


const updateCartQuantity = async (req,res) => {
    try {
        const {productId, variantId, action} =  req.body;
      
        if (!productId || !variantId || !mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
            return res.status(400).json({ success: false, message: 'Invalid product or variant ID' });
        }

        if(!['increment', 'decrement'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        const product = await Product.findById(productId);
        const variant = product.variants.find(v => v._id.toString() === variantId);
        if(!product || !variant) {
            return res.status(404).json({ success: false, message: 'Product or Variant is not found' });
        }

        const cart = await Cart.findOne({ userId: req.session.userId });
        if(!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }
        //find item in cart
        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId && item.variantId.toString() === variantId);

        if(itemIndex === -1){
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        const item = cart.items[itemIndex];
        let newQuantity = item.quantity;

        if(action === 'increment'){
            newQuantity += 1;

            if(newQuantity > maxQuantityPerProduct){
                return res.status(400).json({success: false, message: `Maximum ${maxQuantityPerProduct} items allowed per product`});
            }

            if (newQuantity > variant.stock) {
                return res.status(400).json({success: false, message: `Only ${variant.stock} items available stock in this variant`});
            }
        }else if(action === 'decrement'){
            newQuantity -= 1;

            if(newQuantity <= 0){
                item.quantity = 0;
                item.subtotal = 0;
                cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);
                await cart.save();

                return res.status(200).json({ 
                    success: true, message: 'Item quantity set to 0', quantity: 0, subtotal: 0, totalAmount: cart.totalAmount, cartItemsCount: cart.items.filter(item => item.quantity > 0).length
                });
            }
        }    

        item.quantity = newQuantity;
        item.subtotal = variant.salesPrice * newQuantity;

        cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);

        await cart.save();

        return res.status(200).json({ 
            success: true, message: 'Cart updated successfully', quantity: newQuantity, subtotal: item.subtotal, totalAmount: cart.totalAmount, cartItemsCount: cart.items.length
        });

    } catch (error) {
        console.error("internal error while updating cart quantity : ", error);
        return res.status(500).json({success: false, message: 'Internal server error get while updating cart product quantity'});
    }
}


const getCartCount = async (req,res) => {
    try {
        const cart = await Cart.findOne({userId: req.session.userId});
        const count = cart ? cart.items.length : 0;

        return res.status(200).json({success: true, count});
    } catch (error) {
        console.error("internal error getting cart count:", error);
        return res.status(500).json({success: false, message: 'Internal server error get cart count', count: 0});
    }
}

const loadCheckout = async (req,res) => {
    try {
        const addresses = await Address.find({userId: req.session.userId}).sort({createdAt: -1});
        
        const cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed'}]});

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

        // Check for stock issues
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

        //check if cart has any valid items (quantity > 0 and stock available)
        const hasValidItems = cart.items.some(item => {
            const variant = item.productId.variants.find(v => v._id.toString() === item.variantId.toString());
            return item.quantity > 0 && variant.stock >= item.quantity;
        });

        if(!hasValidItems){
            return res.redirect('/cart?error=no-valid-items');
        }

        //variant labels for display
        if (cart && cart.items) {
            cart.items.forEach(item => {
                const product = item.productId;
                const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                if (variant && product.category) {
                    item.variantLabel = getVariantLabel(variant, product.category.name);
                }
            });
        }

        return res.status(200).render('cart/checkout', {addresses: addresses || [], cart: cart, success: true});

    } catch (error) {
        console.error("Error loading checkout page:", error);
        return res.status(500).render('pageNotFound', {status: 500, message: "Something went wrong while loading checkout page"});
    }
}

const placeOrder = async (req, res) => {

    const session = await mongoose.startSession();
    
    try {
        await session.startTransaction();
        
        const { addressId, paymentMethod, orderedItems } = req.body;
        const userId = req.session.userId;
        
        if (!addressId || !paymentMethod || !orderedItems || orderedItems.length === 0) {
            return res.status(400).json({success: false, message: 'Missing required order information'});
        } 
       
        const address = await Address.findOne({ _id: addressId, userId }).session(session);
        if (!address) {
            return res.status(404).json({success: false,message: 'Address not found'});
        }
        
        const cart = await Cart.findOne({ userId }).populate({path: 'items.productId', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }]}).session(session); 
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({success: false, message: 'Cart is empty'});
        }
        
        //prepare order items with stock validation
        const orderItems = [];
        let subtotal = 0;
        const stockUpdates = [];
        
        for (const orderedItem of orderedItems) {
            const cartItem = cart.items.find(item => 
                item.productId._id.toString() === orderedItem.productId.toString() && item.variantId.toString() === orderedItem.variantId.toString());
            
            if (!cartItem) {
                return res.status(404).json({success: false, message: `Item not found in cart: ${orderedItem.productId}`});
            }
            
            const product = cartItem.productId;
            const variant = product.variants.find(v => v._id.toString() === orderedItem.variantId.toString());
            
            if (!variant) {
                return res.status(404).json({success: false, message: `Variant not found: ${orderedItem.variantId}`});
            }
            
            if (variant.stock < orderedItem.quantity) {
                return res.status(400).json({success: false, message: `Insufficient stock for ${product.name}. Available: ${variant.stock}, Requested: ${orderedItem.quantity}`});
            }
            
            //prepare order item
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
        const orderId = `ORD${Date.now()}${String(orderCount + 1).padStart(6, '0')}`;

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
            confirmedAt: new Date(),
            estimatedDelivery: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        });
        
        await order.save({ session });
        
        //update product stock
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
                estimatedDelivery: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
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

module.exports = {
    loadCart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    getCartCount, 
    loadCheckout,
    placeOrder,
   
}