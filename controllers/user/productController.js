const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema')
const mongoose = require('mongoose');

const loadShopPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const search = req.query.search?.trim() || '';
        const sort = req.query.sort || 'newest';
        //filter variants
        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
        const rating = parseInt(req.query.rating) || 0;
        const categories = req.query.category ? 
            (Array.isArray(req.query.category) ? req.query.category : [req.query.category]) : [];
        const brands = req.query.brand ? 
            (Array.isArray(req.query.brand) ? req.query.brand : [req.query.brand]) : [];
    
        let searchConditions = {};
        if (search) {
            searchConditions.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { 'variants.ingredients': {$regex: search, $options: 'i'}}
            ];
        }

        // Handle multiple categories for filter
        if (categories.length > 0) {
            const validCategories = categories
                .filter(cat => mongoose.Types.ObjectId.isValid(cat))
                .map(cat => new mongoose.Types.ObjectId(cat));
            
            if (validCategories.length > 0) {
                searchConditions.category = { $in: validCategories };
            }
        }

        // Handle multiple brands for filter
        if (brands.length > 0) {
            const validBrands = brands
                .filter(brand => mongoose.Types.ObjectId.isValid(brand))
                .map(brand => new mongoose.Types.ObjectId(brand));
            
            if (validBrands.length > 0) {
                searchConditions.brand = { $in: validBrands };
            }
        }

        // Build sort options
        let sortOptions = {};
        let needsCollection = false;
        switch (sort) {
            case 'price_low_high':
                sortOptions = { 'activeVariant.salesPrice': 1 };
                break;
            case 'price_high_low':
                sortOptions = { 'activeVariant.salesPrice': -1 };
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

        // Main aggregation pipeline
        const pipeline = [
            { $match: searchConditions },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'brand',
                    foreignField: '_id',
                    as: 'brandInfo'
                }
            },
            { $unwind: '$brandInfo' },
            { $match: { 'brandInfo.isListed': true } },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            { $unwind: '$categoryInfo' },
            { $match: { 'categoryInfo.isListed': true } },
            {
                $addFields: {
                    activeVariant: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$variants',
                                    cond: { $eq: ['$$this.isListed', true] }
                                }
                            },
                            0
                        ]
                    }
                }
            },
            { $match: { activeVariant: { $ne: null } } },
            {
                $match: {
                    'activeVariant.salesPrice': {
                        $gte: minPrice,
                        $lte: maxPrice === Infinity ? 999999 : maxPrice
                    }
                }
            }
        ];

        // Add rating filter
        if (rating > 0) {
            pipeline.push(
                {
                    $lookup: {
                        from: 'reviews',
                        localField: '_id',
                        foreignField: 'product',
                        as: 'reviews'
                    }
                },
                {
                    $addFields: {
                        averageRating: {
                            $cond: {
                                if: { $gt: [{ $size: '$reviews' }, 0] },
                                then: { $avg: '$reviews.rating' },
                                else: 0
                            }
                        }
                    }
                },
                { $match: { averageRating: { $gte: rating } } }
            );
        }

        // Add final projection
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
                    name: '$categoryInfo.name'
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
                    offerStatus: '$activeVariant.offerStatus',
                    uom: '$activeVariant.uom',
                    attributes: '$activeVariant.attributes',
                    images: '$activeVariant.images'
                },
                averageRating: { $ifNull: ['$averageRating', 0] }
            }
        });

        //total count for pagination
        const countPipeline = [...pipeline, { $count: 'total' }];
        const totalResult = await Product.aggregate(countPipeline);
        const totalProducts = totalResult[0]?.total || 0;
        const totalPages = Math.ceil(totalProducts / limit);

        pipeline.push(
            { $sort: sortOptions },
            { $skip: skip },
            { $limit: limit }
        );

        //Execute main query with collation for case-insensitive sorting
        const aggregationOptions =  needsCollection ? 
            { collation: { locale: 'en', strength: 2 } } : 
            {};

        const products = await Product.aggregate(pipeline, aggregationOptions);

        const activeCategories = await Category.find({ isListed: true })
            .select('_id name')
            .sort({ name: 1 });
            
        const activeBrands = await Brand.find({ isListed: true })
            .select('_id name')
            .sort({ name: 1 });

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
                rating
            }
        };

        const user = await User.findById(req.session.userId)
      
        // Handle AJAX request
        if (req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                ...responseData,
                
            });
        }
        return res.render('productsPage/shop', responseData );

    } catch (error) {
        console.error('Shop page error:', error);
        if (req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
        return res.status(500).render('pageNotFound');
    }
};

const getSearchSuggestions = async (req, res) => {
    try {
        const query = req.query.q?.trim() || '';
        
        if (!query || query.length <= 1) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const pipeline = [
            {
                $match: {
                    $or: [
                        { name: { $regex: query, $options: 'i' } },
                        { description: { $regex: query, $options: 'i' } },
                        { 'variants.ingredients': {$regex: query, $options: 'i'}}
                    ]
                }
            },
            {
                $lookup: {
                    from: 'brands',
                    localField: 'brand',
                    foreignField: '_id',
                    as: 'brandInfo'
                }
            },
            { $unwind: '$brandInfo' },
            { $match: { 'brandInfo.isListed': true } },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            { $unwind: '$categoryInfo' },
            { $match: { 'categoryInfo.isListed': true } },
            {
                $addFields: {
                    activeVariant: {
                        $arrayElemAt: [
                            {
                                $filter: {
                                    input: '$variants',
                                    cond: { $eq: ['$$this.isListed', true] }
                                }
                            },
                            0
                        ]
                    }
                }
            },
            { $match: { activeVariant: { $ne: null } } },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    brand: '$brandInfo.name',
                    salesPrice: '$activeVariant.salesPrice',
                    image: { 
                        $arrayElemAt: ['$activeVariant.images.url', 0] 
                    }
                }
            },
            { $limit: 5 } // Limit to 5 suggestions
        ];

        const suggestions = await Product.aggregate(pipeline);

        return res.json({
            success: true,
            suggestions: suggestions
        });

    } catch (error) {
        console.error('Search suggestions error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching suggestions'
        });
    }
};

const loadHomePage = async (req,res) => {
    try {
        const products = await Product.find().populate('brand', '_id name isListed').populate('category', '_id name isListed');
        const brands = await Brand.find({isListed: true});

        const activeVariants = products.map(product => {
            if(!product.brand.isListed || !product.category.isListed) return null;
            const activeVariant = product.variants.find(v => v.isListed);
            if(!activeVariant) return null;
            return {
                id: product._id,
                name: product.name,
                brand: product.brand,
                category: product.category,
                salesPrice: activeVariant.salesPrice,
                regularPrice: activeVariant.regularPrice,
                image: activeVariant.images && activeVariant.images.length > 0 
                       ? activeVariant.images[0].url 
                       : null
            }
        }).filter(Boolean);

        const medicalEquipments = activeVariants.filter(p => 
            p.category.name.toLowerCase().includes('medical equipment') || 
            p.category.name.toLowerCase().includes('body support')
        ).slice(0, 8);

        const medicines = activeVariants.filter(p => 
            ['tablet', 'syrup', 'capsule', 'drop', 'ointment'].some(type => 
                p.category.name.toLowerCase().includes(type)
            )
        ).slice(0, 8);

        const foods = activeVariants.filter( p => p.category.name.toLowerCase().includes('food')).slice(0.4);

        return res.render('productsPage/userHome', {
            products: activeVariants,
            brands,
            medicalEquipments,
            medicines,
            foods
        });

    } catch (error) {
        console.error("inter error : ", error);
        return res.render('pageNotFound');
    }
}


module.exports = { 
    loadShopPage,
    getSearchSuggestions,
    loadHomePage
 };