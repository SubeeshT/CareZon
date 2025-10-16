const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const { getVariantLabel } = require('../../utils/variantAttribute');
const mongoose = require('mongoose');


const loadWishlist = async (req,res) => {
    try {
        const userId = req.session.userId;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search?.trim().toLowerCase() || '';


        let wishlist = await Wishlist.findOne({userId}).populate({path: 'items.productId', populate: [{path: 'brand', select: '_id name isListed'}, {path: 'category', select: '_id name isListed'}]});
        if(!wishlist){
            wishlist = new Wishlist({
                userId,
                items: [],
            })
            await wishlist.save()
        }

        const validItems = [];
        if(wishlist && wishlist.items.length > 0){
            for(const item of wishlist.items){
                
                const product = item.productId;
                if (!product) {
                    continue;
                }

                if(!product.brand || !product.category || !product.brand.isListed || !product.category.isListed ){
                    continue;
                }

                const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                if (!variant || !variant.isListed) {
                    continue;
                }

                if (search && !product.name.toLowerCase().includes(search)) {
                    continue;
                }
                
                const variantLabel = getVariantLabel(variant, product.category.name);
                validItems.push({...item.toObject(), variant: variant, variantLabel: variantLabel});
            }
        }   

        validItems.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

        const paginatedItems = validItems.slice(skip, skip + limit);
        const totalCount = validItems.length;
        const pagination = {
            totalCount,
            currentPage: page,
            limit,
            skip,
            totalPages: totalCount > 0 ? Math.ceil(totalCount / limit) : 1,
            hasNextPage: Math.ceil(totalCount / limit) > page,
            hasPrevPage: page > 1
        }

        if(req.headers.accept && req.headers.accept.includes('application/json')){
            return res.status(200).json({success: true, wishlists: paginatedItems, pagination, activePage: 'wishlist'});
        }

        return res.status(200).render('user/account/wishlist', {success: true, wishlists: paginatedItems, pagination, activePage: 'wishlist', search: search});

    } catch (error) {
        console.error("internal error get while loading wishlist : ", error);
        return res.status(500).json({success: false, message: "internal error get while loading wishlist"});
    }
}

const addToWishlist = async (req,res) => {
    try {
        const {productId, variantId} = req.params;
        const userId = req.session.userId;

        if(!productId || !variantId || !mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)){
            return res.status(400).json({success: false, message: "product or variant is not valid"});
        }

        const product = await Product.findById(productId).populate('brand', '_id isListed').populate('category', '_id isListed').lean();

        if(!product){
            return res.status(404).json({success: false, message: "product not found"});
        }

        if(!product.brand || !product.category || !product.brand.isListed || !product.category.isListed){
            return res.status(403).json({success: false, message: "product is currently un available"});
        }

        const variant = product.variants.find(variant => variant._id.toString() === variantId);
        if(!variant){
            return res.status(404).json({success: false, message: "product variant is not found"});
        }

        if(!variant.isListed){
            return res.status(403).json({success: false, message: "variant is not valid item"});
        }

        let wishlist = await Wishlist.findOne({userId});
        if (!wishlist) {
            //if not have, create new wishlist with the item
            wishlist = await Wishlist.create({userId, items: [{productId, variantId, addedAt: new Date()}]});
            return res.status(201).json({success: true, message: 'Added to wishlist', isInWishlist: true});
        }
        //check if item exists
        const itemIndex = wishlist.items.findIndex(item => item.productId.toString() === productId && item.variantId.toString() === variantId);

        let isAdded;
        if (itemIndex > -1) {
            //remove from wishlist
            wishlist.items.splice(itemIndex, 1);
            isAdded = false;
        } else {
            //add to wishlist
            wishlist.items.push({productId, variantId, addedAt: new Date()});
            isAdded = true;
        }

        await wishlist.save();
        return res.status(201).json({success: true, message: isAdded ? 'Added to wishlist' : 'Removed from wishlist', isInWishlist: isAdded});

    } catch (error) {
        console.error("internal error get while add product to wishlist : ", error);
        return res.status(500).json({success: false, message: "internal error get while add to wishlist"});
    }
}

const removeFromWishlist = async (req,res) => {
    try {
        const {variantId} = req.params;
        const userId = req.session.userId;

        if(!variantId || !mongoose.Types.ObjectId.isValid(variantId)){
            return res.status(400).json({success: false, message: "product or variant is not valid"});
        }

        const result = await Wishlist.findOneAndUpdate({userId, 'items.variantId': variantId}, {$pull: {items: {variantId: variantId}}}, {new: true});
        if(!result){
            return res.status(404).json({success: false, message: "item not found in wishlist"});
        }

        return res.status(200).json({success: true, message: "item removed from wishlist successfully"});

    } catch (error) {
        console.error("internal error get while remove product from wishlist : ", error);
        return res.status(500).json({success: false, message: "internal error in remove wishlist"});
    }
}

const checkWishlistStatus = async (req, res) => {
    try {
        const {productId, variantId} = req.params;
        const userId = req.session.userId;

        if(!productId || !variantId || !mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)){
            return res.status(400).json({success: false, message: "Invalid product or variant"});
        }

        const wishlist = await Wishlist.findOne({userId}).lean();   
        if (!wishlist) {
            return res.json({success: true, isInWishlist: false});
        }

        const isInWishlist = wishlist.items.some(
            item => item.productId.toString() === productId && item.variantId.toString() === variantId
        );

        return res.json({success: true, isInWishlist});

    } catch (error) {
        console.error("Error checking wishlist status:", error);
        return res.status(500).json({success: false, message: "Internal error"});
    }
};

module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist,
    checkWishlistStatus 
}