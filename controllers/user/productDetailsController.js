const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const Review = require('../../models/reviewSchema');
const Prescription = require('../../models/prescriptionSchema');
const { uploadImage } = require('../../utils/cloudinary');
const { getCategoryDistinguishingAttributes, getVariantLabel } = require('../../utils/variantAttribute');
const fs = require('fs');
const mongoose = require('mongoose');


const getProductDetails = async (req, res) => {
    try {
        const id = req.params.id;
        const variantIndex = parseInt(req.query.variantIndex) || 0;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) return res.redirect('/products/shop');

        const product = await Product.findById(id).populate('brand', '_id name isListed').populate('category', '_id name isListed');
        if (!product || !product.brand || !product.category || !product.brand.isListed || !product.category.isListed) {
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
                    'variants.ingredients': {$in: selectedVariant.ingredients || []},     
                    'variants.isListed': true
                }
            ]
        }).populate('brand', '_id name isListed').populate('category', '_id name isListed').limit(18);

        const relatedData = relatedProducts.map(product => {
            if (!product.brand || !product.category || !product.brand.isListed || !product.category.isListed) return null;
                
            const activeVariant = product.variants.find(variant => variant.isListed);
            if (!activeVariant) return null;
            
            return {
                id: product._id,
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
                variantIndex: 0,
                variantLabel: getVariantLabel(activeVariant, product.category.name) //variant label for related products
            }
        }).filter(product => product !== null);

        //get category Attributes
        const distinguishingAttrs = getCategoryDistinguishingAttributes(product.category.name);

        let prescriptionStatus = null;
        if (req.user && selectedVariant.prescriptionRequired) {
            prescriptionStatus = await Prescription.findOne({userId: req.user._id, productId: product._id, variantId: selectedVariant._id, }).sort({ createdAt: -1 });
            //status validation for expired prescriptions
            if (prescriptionStatus && prescriptionStatus.expiryDate < new Date()) {
                //update status to expired if the expiry date has passed
                if (prescriptionStatus.status !== 'Expired') {
                    prescriptionStatus.status = 'Expired';
                    await prescriptionStatus.save();
                }
            }
        }

        const responseData = {
            product: {
                id: product._id,
                name: product.name,
                description: product.description,
                brand: product.brand,
                category: product.category,
                variant: selectedVariant,
                currentVariantIndex: actualVariantIndex,
                distinguishingAttributes: distinguishingAttrs,
                allVariants: product.variants.map((variant, originalIndex) => {
                    if (variant.isListed) {
                        const variantObj = variant.toObject();                  
                        //convert Map attributes to plain object
                        if (variantObj.attributes && variantObj.attributes instanceof Map) {
                            variantObj.attributes = Object.fromEntries(variantObj.attributes);
                        } else if (variantObj.attributes && typeof variantObj.attributes === 'object') {
                            //ensure its a plain object
                            variantObj.attributes = JSON.parse(JSON.stringify(variantObj.attributes));
                        }
                        
                        return {
                            ...variantObj,
                            variantIndex: originalIndex,
                            variantLabel: getVariantLabel(variant, product.category.name) //variant label for selection
                        };
                    }
                    return null;
                }).filter(v => v !== null),
                prescriptionStatus: prescriptionStatus ? {
                    status: prescriptionStatus.status.toLowerCase(),
                    canAddToCart: prescriptionStatus.status === 'Verified' && 
                                prescriptionStatus.expiryDate > new Date() && (prescriptionStatus.uom - (prescriptionStatus.usedUom || 0)) > 0,            
                    remainingUom: prescriptionStatus.uom - (prescriptionStatus.usedUom || 0),
                    patientName: prescriptionStatus.patient.name,
                    doctorName: prescriptionStatus.doctor.name,
                    hospitalName: prescriptionStatus.doctor.hospital,
                    medicineName: prescriptionStatus.medicineName,
                    uom: prescriptionStatus.uom,
                    prescriptionDate: prescriptionStatus.prescriptionDate,
                    expiryDate: prescriptionStatus.expiryDate,
                    rejectionReason: prescriptionStatus.rejectionReason || null,
                    prescriptionImages: prescriptionStatus.prescriptionImages
                } : null  
            },
            relatedProducts: relatedData,
        }

        //handle AJAX request
        if (req.headers.accept?.includes('application/json')) {
            return res.json({success: true, ...responseData,});
        }
        return res.render('productsPage/productDetails', responseData);

    } catch (error) {
        console.error("error get while loading product details page : ", error);
        //ajax error response
        if (req.headers.accept?.includes('application/json')) {
            return res.status(500).json({success: false, message: 'Internal server error while loading product detail page'});
        }
        return res.status(500).render('pageNotFound');
    }
}

const uploadPrescription = async (req, res) => {
    try {
        const {productId, variantId, doctorName, hospitalName, patientName, patientAge, patientGender, medicineName, uom, prescriptionDate, expiryDate} = req.body;

        if (!productId || !variantId || !doctorName || !patientName || !patientAge || !patientGender || !medicineName || !uom || !prescriptionDate || !expiryDate) {
            return res.status(400).json({success: false, message: "All fields are required"});
        }

        if (!req.file) {
            return res.status(400).json({success: false, message: "Prescription image is required"});
        }

        if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
            return res.status(400).json({success: false, message: "Invalid product or variant ID"});
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({success: false, message: "Product not found"});
        }

        const selectedVariant = product.variants.id(variantId);
        if (!selectedVariant) {
            return res.status(400).json({success: false, message: "Variant not found"});
        }

        if (!selectedVariant.prescriptionRequired) {
            return res.status(400).json({success: false, message: "This product does not require prescription"});
        }

        if (!selectedVariant.isListed) {
            return res.status(400).json({success: false, message: "This product variant is not available"});
        }
        //check if user already has a pending/verified prescription for this specific product variant
        const existingPrescription = await Prescription.findOne({
            userId: req.user._id, productId: productId, medicineName: { $regex: new RegExp(medicineName, 'i') }, status: { $in: ['Pending', 'Verified'] }
        });

        if (existingPrescription) {
            if (existingPrescription.status === 'Verified') {
                //check if prescription is still valid and has remaining UOM
                const today = new Date();
                if (existingPrescription.expiryDate > today) {
                    const usedUom = existingPrescription.usedUom || 0;
                    const remainingUom = existingPrescription.uom - usedUom;
                    
                    if (remainingUom > 0) {
                        return res.status(200).json({
                            success: true, message: "Valid prescription already exists", prescriptionId: existingPrescription._id, remainingUom: remainingUom, canAddToCart: true
                        });
                    }
                }
            } else if (existingPrescription.status === 'Pending') {
                return res.status(200).json({
                    success: true, message: "Prescription already uploaded and pending for verification", prescriptionId: existingPrescription._id, canAddToCart: false
                });
            }
        }
        //upload prescription image to Cloudinary
        const uploadResult = await uploadImage(req.file.path, {folder: 'prescriptions'});

        if (!uploadResult.success) {
            //clean up temp file on upload failure
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(500).json({success: false, message: "Failed to upload prescription image"});
        }
        //create new prescription
        const newPrescription = new Prescription({
            userId: req.user._id,
            productId: productId,
            variantId: selectedVariant._id,
            doctor: {
                name: doctorName,
                hospital: hospitalName || ''
            },
            patient: {
                name: patientName,
                age: parseInt(patientAge),
                gender: patientGender
            },
            prescriptionImages: [{
                public_id: uploadResult.public_id,
                url: uploadResult.url,
                altText: `Prescription for ${patientName} - ${medicineName}`
            }],
            medicineName: medicineName,
            uom: parseInt(uom),
            prescriptionDate: new Date(prescriptionDate),
            expiryDate: new Date(expiryDate),
            status: 'Pending'
        });

        await newPrescription.save();

        //clean up temp file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(201).json({
            success: true, message: "Prescription uploaded successfully. Please wait for admin verification before adding to cart.", prescriptionId: newPrescription._id, canAddToCart: false //cannot add to cart until verified
        });

    } catch (error) {
        console.error("Error grt uploading prescription : ", error);
        
        //clean up temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({success: false, message: "Server error while uploading prescription"});
    }
};

const getPrescriptionStatus = async (req, res) => {
    try {
        if (!req.user) {
            return res.json({ success: false, message: 'User not authenticated' });
        }

        const { productId, variantId } = req.params;
        
        const prescription = await Prescription.findOne({
            userId: req.user._id, productId, variantId, status: { $in: ['Verified', 'Pending'] }, expiryDate: { $gt: new Date() }
        });

        if (!prescription) {
            return res.json({ success: true, prescriptionRequired: true, canAddToCart: false });
        }

        const remainingUom = prescription.uom - (prescription.usedUom || 0);
        
        res.json({
            success: true, prescriptionStatus: prescription.status, canAddToCart: prescription.status === 'Verified' && remainingUom > 0, remainingUom, patientName: prescription.patient.name
        });

    } catch (error) {
        console.error('Error getting prescription status:', error);
        res.status(500).json({ success: false, message: 'Server error while find prescription status' });
    }
};

module.exports = {
    getProductDetails,
    uploadPrescription,
    getPrescriptionStatus ,

}