const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const { calculateDiscountedPrice, calculateEffectiveDiscount } = require('../../utils/discountValue');
const mongoose = require('mongoose');

const loadShopPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        
        const search = req.query.search?.trim() || '';
        const sort = req.query.sort || 'newest';
        //filter variants
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
        const categories = req.query.category ? (Array.isArray(req.query.category) ? req.query.category : [req.query.category]) : [];
        const brands = req.query.brand ? (Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand]) : [];
    
        let searchConditions = {};
        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); //escape from special regex characters , while searching
            searchConditions.$or = [
                { name: { $regex: escapedSearch, $options: 'i' } },
                { description: { $regex: escapedSearch, $options: 'i' } },
                { 'variants.ingredients': {$regex: escapedSearch, $options: 'i'}}
            ];
        }

        //handle multiple categories for filter
        if (categories.length > 0) {
            const validCategories = categories.filter(cat => mongoose.Types.ObjectId.isValid(cat)).map(cat => new mongoose.Types.ObjectId(cat));
            
            if (validCategories.length > 0) {
                searchConditions.category = { $in: validCategories };
            }
        }
        //handle multiple brands for filter
        if (brands.length > 0) {
            const validBrands = brands.filter(brand => mongoose.Types.ObjectId.isValid(brand)).map(brand => new mongoose.Types.ObjectId(brand));
            
            if (validBrands.length > 0) {
                searchConditions.brand = { $in: validBrands };
            }
        }

        //sort options
        let sortOptions = {};
        let needsCollection = false;
        switch (sort) {
            case 'price_low_high':
                sortOptions = { 'activeVariant.regularPrice': 1 };
                break;
            case 'price_high_low':
                sortOptions = { 'activeVariant.regularPrice': -1 };
                break;
            case 'name_asc':
                sortOptions = { name: 1 };
                needsCollection = true;
                break;
            case 'name_desc':
                sortOptions = { name: -1 };
                needsCollection = true;
                break;
            case 'newest':
            default:
                sortOptions = { createdAt: -1 };
                break;
        }

        //main aggregation pipeline
        const pipeline = [
            { $match: searchConditions },
            {
                $lookup: {from: 'brands', localField: 'brand', foreignField: '_id', as: 'brandInfo'}
            },
            { $unwind: '$brandInfo' },
            { $match: { 'brandInfo.isListed': true } },
            {
                $lookup: {from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryInfo'}
            },
            { $unwind: '$categoryInfo' },
            { $match: { 'categoryInfo.isListed': true } },
            {
                $addFields: {activeVariant: {$arrayElemAt: [{$filter: {input: '$variants',cond: { $eq: ['$$this.isListed', true] }}},0]}}
            },
            { $match: { activeVariant: { $ne: null } } },
        ];

        //final projection
        pipeline.push({
            $project: {
                _id: 1,
                name: 1,
                description: 1,
                createdAt: 1,
                brand: {
                    _id: '$brandInfo._id',
                    name: '$brandInfo.name'
                },
                category: {
                    _id: '$categoryInfo._id',
                    name: '$categoryInfo.name',
                    categoryDiscount: '$categoryInfo.Discounts',
                    categoryDiscountStatus: '$categoryInfo.DiscountStatus'
                },
                activeVariant: {
                    _id: '$activeVariant._id',
                    quantity: '$activeVariant.quantity',
                    stock: '$activeVariant.stock',
                    regularPrice: '$activeVariant.regularPrice',
                    salesPrice: '$activeVariant.salesPrice',
                    manufacturingDate: '$activeVariant.manufacturingDate',
                    expiryDate: '$activeVariant.expiryDate',
                    prescriptionRequired: '$activeVariant.prescriptionRequired',
                    discountStatus: '$activeVariant.discountStatus',
                    productDiscount: '$activeVariant.discountValue',
                    offerStatus: '$activeVariant.offerStatus',
                    uom: '$activeVariant.uom',
                    attributes: '$activeVariant.attributes',
                    images: '$activeVariant.images'
                },
                averageRating: { $ifNull: ['$averageRating', 0] }
            }
        });

        pipeline.push({ $sort: sortOptions });

        //case insensitive sorting for names
        const aggregationOptions = needsCollection ? { collation: { locale: 'en', strength: 2 } } : {};

        //get all products without pagination first
        let allProducts = await Product.aggregate(pipeline, aggregationOptions);

        //calculate effective prices for ALL products
        allProducts = allProducts.map(product => {
            const effectivePrice = calculateDiscountedPrice( //calling utils function to find actual discount price
                product.activeVariant.regularPrice,
                product.activeVariant.productDiscount || 0,
                product.activeVariant.discountStatus || false,
                product.category.categoryDiscount || 0,
                product.category.categoryDiscountStatus || false
            );
            
            const discountInfo = calculateEffectiveDiscount( //calling utils function to find greater discount % value
                product.activeVariant.productDiscount || 0,
                product.activeVariant.discountStatus || false,
                product.category.categoryDiscount || 0,
                product.category.categoryDiscountStatus || false
            );
            
            return {
                ...product,
                activeVariant: {
                    ...product.activeVariant,
                    effectivePrice,
                    effectiveDiscount: discountInfo.effectiveDiscount
                }
            };
        });

        //filter by price range using effective price 
        let filteredProducts = allProducts;
        if (minPrice > 0 || maxPrice !== Infinity) {
            filteredProducts = allProducts.filter(product => {
                const price = product.activeVariant.effectivePrice;
                return price >= minPrice && price <= (maxPrice === Infinity ? 999999 : maxPrice);
            });
        }

        //sort by effective price
        if (sort === 'price_low_high') {
            filteredProducts.sort((a, b) => a.activeVariant.effectivePrice - b.activeVariant.effectivePrice);
        } else if (sort === 'price_high_low') {
            filteredProducts.sort((a, b) => b.activeVariant.effectivePrice - a.activeVariant.effectivePrice);
        }

        //calculate pagination
        const totalProducts = filteredProducts.length;
        const totalPages = Math.ceil(totalProducts / limit);

        //apply pagination manually
        const products = filteredProducts.slice(skip, skip + limit);

        const activeCategories = await Category.find({ isListed: true }).select('_id name').sort({ name: 1 });
            
        const activeBrands = await Brand.find({ isListed: true }).select('_id name').sort({ name: 1 });

        //check wishlist status for logged-in users
        if (req.session.userId) {
            const wishlist = await Wishlist.findOne({ userId: req.session.userId }).lean();
            const wishlistItems = wishlist ? wishlist.items : [];
            
            //create a Set for faster lookup (product variant combination)
            const wishlistSet = new Set(wishlistItems.map(item => `${item.productId.toString()}_${item.variantId.toString()}`));
            
            //add isInWishlist property to each product
            products.forEach(product => {
                const key = `${product._id.toString()}_${product.activeVariant._id.toString()}`;
                product.isInWishlist = wishlistSet.has(key);
            });
        } else {
            products.forEach(product => { //not logged in - all products are not in wishlist
                product.isInWishlist = false;
            });
        }

        const responseData = {
            products,
            categories: activeCategories,
            brands: activeBrands,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit
            },
            filters: {
                search,
                sort,
                categories,
                brands,
                minPrice: minPrice === 0 ? '' : minPrice,
                maxPrice: maxPrice === Infinity ? '' : maxPrice,
            }
        };
      
        //handle AJAX/json request
        if (req.headers.accept?.includes('application/json')) {
            return res.json({success: true,...responseData,});
        }
        return res.render('productsPage/shop', responseData );

    } catch (error) {
        console.error('Shop page error:', error);
        if (req.headers.accept?.includes('application/json')) {
            return res.status(500).json({success: false, message: 'Internal server error'});
        }
        return res.status(500).render('pageNotFound');
    }
};

const getSearchSuggestions = async (req, res) => {
    try {
        const query = req.query.q?.trim() || '';
        
        if (!query || query.length <= 1) {
            return res.json({success: true, suggestions: []});
        }

        const pipeline = [
            {
                $match: {
                    $or: [//escape from special regex characters , while searching
                        { name: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                        { description: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                        { 'variants.ingredients': {$regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i'}}
                    ]
                }
            },
            {
                $lookup: {from: 'brands', localField: 'brand', foreignField: '_id', as: 'brandInfo'}
            },
            { $unwind: '$brandInfo' },
            { $match: { 'brandInfo.isListed': true } },
            {
                $lookup: {from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryInfo'}
            },
            { $unwind: '$categoryInfo' },
            { $match: { 'categoryInfo.isListed': true } },
            {
                $addFields: {activeVariant: {$arrayElemAt: [{$filter: {input: '$variants', cond: { $eq: ['$$this.isListed', true] }}},0]}}
            },
            { $match: { activeVariant: { $ne: null } } },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    brand: '$brandInfo.name',
                    salesPrice: '$activeVariant.salesPrice',
                    image: {$arrayElemAt: ['$activeVariant.images.url', 0]}
                }
            },
            { $limit: 5 } //5 suggestions
        ];

        const suggestions = await Product.aggregate(pipeline);

        return res.json({success: true, suggestions: suggestions});

    } catch (error) {
        console.error('Search suggestions error:', error);
        return res.status(500).json({success: false, message: 'Error fetching suggestions'});
    }
};

const loadHomePage = async (req,res) => {
    try {
        const products = await Product.find().populate('brand', '_id name isListed').populate('category', '_id name isListed Discounts DiscountStatus');

        const brands = await Brand.find({isListed: true}).select("_id logo");

        const activeVariants = products.map(product => {
            if(!product.brand.isListed || !product.category.isListed) return null;
            const activeVariant = product.variants.find(v => v.isListed);
            if(!activeVariant) return null;

            //calculate effective price using discount utils function
            const effectivePrice = calculateDiscountedPrice(
                activeVariant.regularPrice,
                activeVariant.discountValue || 0,
                activeVariant.discountStatus || false,
                product.category.Discounts || 0,
                product.category.DiscountStatus || false
            );

            const discountInfo = calculateEffectiveDiscount( //find which discount % value is greater, using utils function
                activeVariant.discountValue || 0,
                activeVariant.discountStatus || false,
                product.category.Discounts || 0,
                product.category.DiscountStatus || false
            );

            return {
                id: product._id,
                name: product.name,
                brand: product.brand,
                category: product.category,
                salesPrice: effectivePrice,
                regularPrice: activeVariant.regularPrice,
                effectiveDiscount: discountInfo.effectiveDiscount,
                image: activeVariant.images && activeVariant.images.length > 0 ? activeVariant.images[0].url : null
            }
        }).filter(Boolean);

        const medicalEquipments = activeVariants.filter(p => //filter medical equipment and body support category only for display
            p.category.name.toLowerCase().includes('medical equipment') || p.category.name.toLowerCase().includes('body support')
        ).slice(0, 8);

        const medicines = activeVariants.filter(p => //filter 'tablet', 'syrup', 'capsule', 'drop', 'ointment' category only for display
            ['tablet', 'syrup', 'capsule', 'drop', 'ointment'].some(type => p.category.name.toLowerCase().includes(type))).slice(0, 8);

        const foods = activeVariants.filter(p => p.category.name.toLowerCase().includes('food')).slice(0, 4);//filter food category only for display

        return res.render('productsPage/userHome', {
            products: activeVariants, 
            brands, 
            medicalEquipments, 
            medicines, 
            foods
        });

    } catch (error) {
        console.error("internal error : ", error);
        return res.render('pageNotFound');
    }
}


module.exports = { 
    loadShopPage,
    getSearchSuggestions,
    loadHomePage
 };