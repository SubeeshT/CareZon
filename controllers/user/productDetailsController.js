const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const Review = require('../../models/reviewSchema');
const mongoose = require('mongoose');


const getProductDetails = async (req,res) => {
    try {
        const id = req.params.id;
        const variantIndex = parseInt(req.query.variantIndex) || 0;

        if(!id || !mongoose.Types.ObjectId.isValid(id)) return res.redirect('/products/shop');

        const product = await Product.findById(id).populate('brand', '_id name isListed').populate('category', '_id name isListed');
        if(!product || !product.brand || !product.category){
            return res.redirect('/products/shop');
        }

        if (!product.brand.isListed || !product.category.isListed) {
            return res.redirect('/products/shop');
        }

        if (!product.variants.length) {
            return res.redirect('/products/shop');
        }

        let selectedVariant = product.variants[variantIndex];
        let actualVariantIndex = variantIndex;

        // If the requested variant doesn't exist or is not listed, find the first listed one
        if (!selectedVariant || !selectedVariant.isListed) {
            const firstListedVariantIndex = product.variants.findIndex(variant => variant.isListed);
            
            if (firstListedVariantIndex === -1) {
                return res.redirect('/products/shop');
            }
            
            selectedVariant = product.variants[firstListedVariantIndex];
            actualVariantIndex = firstListedVariantIndex;
        }


        //related products
        const relatedProducts = await Product.find({
            _id: {$ne: product._id},
            $or: [
                {
                    category: product.category._id,
                    'variants.isListed': true
                },
                {
                      $or: [
                            { 'variants.ingredients': {$in: selectedVariant.ingredients || []} },
                            { 'variants.attributes.ingredients': {$regex: new RegExp((selectedVariant.ingredients || []).join('|'), 'i')} }
                        ],
                        'variants.isListed': true
                }
            ]
        }).populate('brand', '_id name isListed').populate('category', '_id name isListed').limit(18);


        const relatedData = relatedProducts.map(product => {
            if (!product.brand || !product.category || !product.brand.isListed || !product.category.isListed) return null;
                
            const activeVariant = product.variants.find(variant => variant.isListed);
            if(!activeVariant) return null;
            return {
                id:product._id,
                name: product.name,
                brand: product.brand,
                category: product.category,
                description: product.description,
                stock: activeVariant.stock,
                regularPrice: activeVariant.regularPrice,
                salesPrice: activeVariant.salesPrice,
                manufacturingDate: activeVariant.manufacturingDate,
                expiryDate: activeVariant.expiryDate,
                prescriptionRequired: activeVariant.prescriptionRequired,
                discountStatus: activeVariant.discountStatus,
                offerStatus: activeVariant.offerStatus,
                uom: activeVariant.uom,
                attributes: activeVariant.attributes,
                ingredients: activeVariant.ingredients,
                images: activeVariant.images,
                variantIndex: 0
            }
        }).filter(product => product !== null);

        const categoryAttributes = {
            'TABLET': ['mg'],
            'CAPSULE': ['mg'], 
            'NRX TABLET': ['mg'],
            'OINTMENT': ['mg'],
            'DROPS': ['ml'],
            'SYRUP': ['ml'],
            'FOOD': ['kg'],
            'MEDICAL EQUIPMENTS': ['color'],
            'BODY SUPPORT': ['size']
        };

        const distinguishingAttrs = categoryAttributes[product.category.name.toUpperCase()] || [];

        const responseData = {
            product: {
                id: product._id,
                name: product.name,
                description: product.description,
                brand: product.brand,
                category: product.category,
                variant: selectedVariant,
                currentVariantIndex: actualVariantIndex,
                distinguishingAttributes: distinguishingAttrs ,
                allVariants: product.variants.map((variant, originalIndex) => {
                if (variant.isListed) {
                    const variantObj = variant.toObject();                  
                    // Convert Map attributes to plain object
                    if (variantObj.attributes && variantObj.attributes instanceof Map) {
                        variantObj.attributes = Object.fromEntries(variantObj.attributes);
                    } else if (variantObj.attributes && typeof variantObj.attributes === 'object') {
                        // Ensure it's a plain object
                        variantObj.attributes = JSON.parse(JSON.stringify(variantObj.attributes));
                    }
                    return {
                        ...variantObj,
                        variantIndex: originalIndex
                    };
                }
                return null;
            }).filter(v => v !== null)  
            },
            relatedProducts: relatedData,
        }

         //handle AJAX request
        if (req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                ...responseData,
                
            });
        }
        return res.render('productsPage/productDetails', responseData);

    } catch (error) {
        console.error("error get while loading product details page : ", error);
         //AJAX error response
        if (req.headers.accept?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
        return res.status(500).render('pageNotFound');
    }
}



module.exports = {
    getProductDetails,
    
}