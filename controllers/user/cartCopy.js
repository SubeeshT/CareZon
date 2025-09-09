const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema')
const Address = require('../../models/addressSchema');
const Prescription = require('../../models/prescriptionSchema');
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

            let adjustedQuantity = item.quantity;
            let stockIssue = false;

            if(variant.stock < item.quantity){
                stockIssue = true;
            }

            const subtotal = variant.salesPrice * adjustedQuantity;

            validItems.push({
                productId: item.productId,
                variantId: item.variantId,
                quantity: adjustedQuantity,
                subtotal: adjustedQuantity > 0 ? subtotal : 0,
                stockIssue: stockIssue,
                availableStock: variant.stock
            });

            if(adjustedQuantity > 0) {
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
                //check if there's any prescription and return appropriate message
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
                return res.status(400).json({success: false, message: `Only ${variant.stock} items available in stock`});
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


const validateCartForCheckout = async (req,res) => {
    try {
        const cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed'}]});
        if(!cart || cart.items.length === 0){
            return res.status(400).json({success: false, message: "your cart is empty"});
        }

        const availableItems = [];   
        const unavailableItems = [];  
        const adjustedItems = [];     
        const issues = [];

        for(const item of cart.items){
            const product = item.productId;
            if (!product || !product.brand || !product.category || !product.brand.isListed || !product.category.isListed){
                unavailableItems.push(item);
                issues.push(`${product?.name || 'Unknown product'} is no longer available`);
                continue;
            }

            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if(!variant || !variant.isListed){
                unavailableItems.push(item);
                issues.push(`${product.name} variant is no longer available`);
                continue;
            }

            if(variant.stock === 0){
                unavailableItems.push({
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: item.quantity,
                    subtotal: variant.salesPrice * item.quantity  //original subtotal for display
                });
                issues.push(`${product.name} is currently out of stock but will remain in your cart`);
                continue;
            }
            
            if(!variant.isListed){
                unavailableItems.push(item);
                issues.push(`${product.name} variant is no longer available`);
                continue;
            }

            if (variant.stock < item.quantity) {
                const availableQty = variant.stock;
                const unavailableQty = item.quantity - variant.stock;

                //available product with available quantity (to be ordered)
                if (availableQty > 0) {
                    availableItems.push({
                        productId: item.productId._id,
                        variantId: item.variantId,
                        quantity: availableQty,
                        subtotal: variant.salesPrice * availableQty,
                        product: product,
                        variant: variant
                    });
                }    
                //unavailable products with pending quantity (stays in cart)
                unavailableItems.push({
                    productId: item.productId,
                    variantId: item.variantId,
                    quantity: unavailableQty,
                    subtotal: variant.salesPrice * unavailableQty
                });

                adjustedItems.push({
                    productName: product.name,
                    requestedQty: item.quantity,
                    availableQty: availableQty,
                    unavailableQty: unavailableQty
                });

                issues.push(`Only ${availableQty} units of ${product.name} available. ${unavailableQty} units will remain in cart.`);
                continue;
            }

            //fULL STOCK: Item is fully available only
            availableItems.push({
                productId: item.productId._id,
                variantId: item.variantId,
                quantity: item.quantity,
                subtotal: item.subtotal,
                product: product,
                variant: variant
            });
        }

        //calculate totals
        const orderTotal = availableItems.reduce((total, item) => total + item.subtotal, 0);
        const remainingTotal = unavailableItems.reduce((total, item) => total + item.subtotal, 0);
        const deliveryFee = orderTotal < 300 ? 50 : 0;
        const finalTotal = orderTotal + deliveryFee;

        if(availableItems.length === 0){
            return res.status(400).json({success: false, message: 'No items available for checkout. All items are out of stock or unavailable.', issues, unavailableCount: unavailableItems.length});
        }

        //SUCCESS: Some or all items available for checkout
        return res.status(200).json({
            success: true,
            message: availableItems.length === cart.items.length ? 
                'All items available for checkout' : 
                'Partial checkout available',
            
            //items that can be ordered
            availableItems,
            availableCount: availableItems.length,
            orderTotal,
            deliveryFee,        
            finalTotal,
            
            //items that will remain in cart
            unavailableItems,
            unavailableCount: unavailableItems.length,
            remainingTotal,
            
            //summary
            adjustedItems,
            issues,
            isPartialCheckout: unavailableItems.length > 0
        });


    } catch (error) {
        console.error("internal error validating cart for checkout:", error);
        return res.status(500).json({success: false, message: 'Internal server error get while check out validation'});
    }
}


const processPartialCheckout = async (req,res) => {
    try {
        const {orderedItems} = req.body;
        if(!orderedItems || !Array.isArray(orderedItems) || orderedItems.length === 0){
            return res.status(400).json({success: false, message: 'No ordered items provided'});
        }

        const cart = await Cart.findOne({userId: req.session.userId});
        if(!cart){
            return res.status(404).json({success: false, message: 'Cart not found'});
        }

        //for remove ordered items from cart, keep unordered ones
        const remainingItems = [];

        for(const cartItem of cart.items){
            const wasOrdered = orderedItems.some(orderedItem => 
                cartItem.productId.toString() === orderedItem.productId.toString() && cartItem.variantId.toString() === orderedItem.variantId.toString()
            );

            if(!wasOrdered){//if item was not ordered,item will keep in cart
                remainingItems.push(cartItem);
            }else{
                //check if partial quantity was ordered
                const orderedItem = orderedItems.find(ordered => 
                    cartItem.productId.toString() === ordered.productId.toString() &&
                    cartItem.variantId.toString() === ordered.variantId.toString()
                );

                if(orderedItem && cartItem.quantity > orderedItem.quantity){
                    //partial order: it will keep remaining quantity in cart
                    const remainingQty = cartItem.quantity - orderedItem.quantity;
                    const product = await Product.findById(cartItem.productId);
                    const variant = product.variants.find(v => v._id.toString() === cartItem.variantId.toString());
                    
                    remainingItems.push({
                        productId: cartItem.productId,
                        variantId: cartItem.variantId,
                        quantity: remainingQty,
                        subtotal: variant.salesPrice * remainingQty
                    });
                }
            }
        }
        //update cart with remaining items
        cart.items = remainingItems;
        cart.totalAmount = remainingItems.reduce((total, item) => total + item.subtotal, 0);
        await cart.save();

        return res.status(200).json({
            success: true,
            message: remainingItems.length > 0 ? 'Order completed! Some items remain in your cart.' : 'Order completed! Cart is now empty.',
            remainingItemsCount: remainingItems.length,
            remainingTotal: cart.totalAmount
        });

    } catch (error) {
        console.error("internal error get while processing partial checkout:", error);
        return res.status(500).json({success: false, message: 'internal error updating cart after order'});
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

module.exports = {
    loadCart,
    addToCart,
    removeFromCart,
    updateCartQuantity ,
    validateCartForCheckout,
    processPartialCheckout,
    getCartCount, 
    loadCheckout,
   
}