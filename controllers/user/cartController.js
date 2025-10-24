const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema')
const Prescription = require('../../models/prescriptionSchema');
const {getVariantLabel} = require('../../utils/variantAttribute');
const {calculateEffectiveDiscount, calculateDiscountedPrice} = require('../../utils/discountValue');
const { default: mongoose } = require('mongoose');


const maxQuantityPerProduct = 10;

const loadCart = async (req,res) => {
    try {  
        let cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed Discounts DiscountStatus'}]});
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

            const correctSalesPrice = calculateDiscountedPrice(//utils function for get actual sales price comparing with greater discount % value
                variant.regularPrice,
                variant.discountValue || 0,
                variant.discountStatus || false,
                product.category.Discounts || 0,
                product.category.DiscountStatus || false
            );

            const discountInfo = calculateEffectiveDiscount(//utils function for get greater discount % value
                variant.discountValue || 0,
                variant.discountStatus || false,
                product.category.Discounts || 0,
                product.category.DiscountStatus || false
            );

            const subtotal = Math.round(correctSalesPrice * item.quantity);

            validItems.push({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                subtotal: item.quantity > 0 ? subtotal : 0,
                stockIssue: stockIssue,
                availableStock: variant.stock,
                correctSalesPrice: correctSalesPrice,
                effectiveDiscountPercent: discountInfo.effectiveDiscount
            });

            if(item.quantity > 0) {
                totalAmount += subtotal;
            }
        }
        //update cart if there were any changes
        if(cartUpdated){
            cart.items = validItems;
            const deliveryFee = totalAmount > 0 && totalAmount < 300 ? 50 : 0;
            cart.totalAmount = totalAmount + deliveryFee;
            cart.deliveryFee = deliveryFee;
            await cart.save();
        }

        //re populate for display
        cart = await Cart.findOne({userId: req.session.userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed Discounts DiscountStatus'}]});

        //variant labels to cart items for display (find from utils folder) = attributes
        if (cart && cart.items) {
            cart.items.forEach(item => {
                const product = item.productId;
                const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                if (variant && product.category) {
                    item.variantLabel = getVariantLabel(variant, product.category.name);
                    
                    //correct pricing with effective discount
                    const correctSalesPrice = calculateDiscountedPrice(
                        variant.regularPrice,
                        variant.discountValue || 0,
                        variant.discountStatus || false,
                        product.category.Discounts || 0,
                        product.category.DiscountStatus || false
                    );

                    const discountInfo = calculateEffectiveDiscount(
                        variant.discountValue || 0,
                        variant.discountStatus || false,
                        product.category.Discounts || 0,
                        product.category.DiscountStatus || false
                    );

                    item.correctSalesPrice = correctSalesPrice;
                    item.effectiveDiscountPercent = discountInfo.effectiveDiscount;
                    item.subtotal = Math.round(correctSalesPrice * item.quantity);
                }
            });
        }

        //calculate final totals for display
        let finalTotalAmount = 0;
        let finalDeliveryFee = 0;

        if (cart && cart.items && cart.items.length > 0) {
            let subtotalBeforeDelivery = 0;
            
            cart.items.forEach(item => {
                if (item.quantity > 0) {
                    subtotalBeforeDelivery += item.subtotal;
                }
            });
            
            finalDeliveryFee = subtotalBeforeDelivery > 0 && subtotalBeforeDelivery < 300 ? 50 : 0;
            finalTotalAmount = subtotalBeforeDelivery + finalDeliveryFee;
            
            cart.deliveryFee = finalDeliveryFee;
            cart.totalAmount = finalTotalAmount;
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

                const cartItemsCount = cart.items.reduce((count, item) => count + item.quantity, 0);

                let totalRegularPrice = 0;
                let totalSalesPrice = 0;

                for (const cartItem of cart.items) {
                    if (cartItem.quantity > 0) {
                        const prod = await Product.findById(cartItem.productId).populate('category', 'Discounts DiscountStatus');
                        if (prod) {
                            const variant = prod.variants.find(v => v._id.toString() === cartItem.variantId.toString());
                            if (variant) {
                                const correctSalesPrice = calculateDiscountedPrice(
                                    variant.regularPrice,
                                    variant.discountValue || 0,
                                    variant.discountStatus || false,
                                    prod.category.Discounts || 0,
                                    prod.category.DiscountStatus || false
                                );
                                
                                totalRegularPrice += Math.round(variant.regularPrice * cartItem.quantity);
                                totalSalesPrice += Math.round(correctSalesPrice * cartItem.quantity);
                            }
                        }
                    }
                }

                const totalDiscount = Math.round(totalRegularPrice - totalSalesPrice);
                const deliveryFee = totalSalesPrice > 0 && totalSalesPrice < 300 ? 50 : 0;
                const finalTotal = Math.round(totalSalesPrice + deliveryFee);

                return res.status(200).json({ 
                    success: true, 
                    message: 'Item quantity set to 0', 
                    quantity: 0, 
                    subtotal: 0, 
                    totalAmount: finalTotal, 
                    cartItemsCount: cartItemsCount,
                    totalRegularPrice: Math.round(totalRegularPrice),
                    totalDiscount: Math.round(totalDiscount),
                    deliveryFee: deliveryFee,
                    subtotalBeforeDelivery: Math.round(totalSalesPrice)
                });
            }
        }    

        //calculate correct sales price using effective discount
        const productWithCategory = await Product.findById(productId).populate('category', 'Discounts DiscountStatus');
        const correctSalesPrice = calculateDiscountedPrice(
            variant.regularPrice,
            variant.discountValue || 0,
            variant.discountStatus || false,
            productWithCategory.category.Discounts || 0,
            productWithCategory.category.DiscountStatus || false
        );

        item.quantity = newQuantity;
        item.subtotal = Math.round(correctSalesPrice * newQuantity);

        cart.totalAmount = cart.items.reduce((total, item) => total + item.subtotal, 0);
        cart.deliveryFee = cart.totalAmount < 300 ? 50 : 0;

        await cart.save();

        const cartItemsCount = cart.items.reduce((count, item) => count + item.quantity, 0);

        let totalRegularPrice = 0;
        let totalSalesPrice = 0;

        for (const cartItem of cart.items) {
            if (cartItem.quantity > 0) {
                const prod = await Product.findById(cartItem.productId).populate('category', 'Discounts DiscountStatus');
                if (prod) {
                    const cartVariant = prod.variants.find(v => v._id.toString() === cartItem.variantId.toString());
                    if (cartVariant) {
                        const itemCorrectSalesPrice = calculateDiscountedPrice(
                            cartVariant.regularPrice,
                            cartVariant.discountValue || 0,
                            cartVariant.discountStatus || false,
                            prod.category.Discounts || 0,
                            prod.category.DiscountStatus || false
                        );
                        
                        totalRegularPrice += Math.round(cartVariant.regularPrice * cartItem.quantity);
                        totalSalesPrice += Math.round(itemCorrectSalesPrice * cartItem.quantity);
                    }
                }
            }
        }

        const totalDiscount = Math.round(totalRegularPrice - totalSalesPrice);
        const deliveryFee = totalSalesPrice > 0 && totalSalesPrice < 300 ? 50 : 0;
        const finalTotal = Math.round(totalSalesPrice + deliveryFee);

        return res.status(200).json({ 
            success: true, 
            message: 'Cart quantity updated successfully', 
            quantity: newQuantity, 
            subtotal: Math.round(item.subtotal), 
            totalAmount: finalTotal,
            cartItemsCount: cartItemsCount,
            totalRegularPrice: Math.round(totalRegularPrice),
            totalDiscount: Math.round(totalDiscount),
            deliveryFee: deliveryFee,
            subtotalBeforeDelivery: Math.round(totalSalesPrice)
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


module.exports = {
    loadCart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    getCartCount, 
   
}