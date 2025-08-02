const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const { uploadImage, deleteImage } = require('../../utils/cloudinary');
const fs = require('fs').promises;

const loadProductListPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const brands = await Brand.find({ status: true }).select('_id name');
        const categories = await Category.find({ isListed: true }).select('_id name');

        const totalProducts = await Product.countDocuments({});
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Product.find({}).sort({createdAt: -1}).skip(skip).limit(limit).populate('brand', 'name').populate('category', 'name').lean();
        const formattedProducts = products.map((product, index) => {
            const activeVariant = product.variants.find(v => v.isListed) || product.variants[0];

            return {
                _id: product._id,
                name: product.name,
                description: product.description,
                brand: product.brand.name,
                category: product.category.name,
                regularPrice: activeVariant.regularPrice,
                salesPrice: activeVariant.salesPrice,
                stock: activeVariant.stock,
                offerStatus: activeVariant.offerStatus || false,
                discountStatus: activeVariant.discountStatus || false,
                prescriptionRequired: activeVariant.prescriptionRequired || false,
                isListed: activeVariant.isListed || false,
                manufacturingDate: activeVariant.manufacturingDate,
                expiryDate: activeVariant.expiryDate,
                uom: activeVariant.uom,
                images: activeVariant.images,
                attributes: activeVariant.attributes,
                variantCount: product.variants.length,
                serialNo: skip + index + 1
            }
        });
    
        return res.render('product/productManagement', {
            products: formattedProducts,
            currentPage: page, 
            totalPages,
            categories,
            brands
        });

    } catch (error) {
        console.error("Error loading product list page:", error);
        return res.status(500).render('error', {success:false, message: "Failed to load product list Page"});
    }
};

// Load Add Product Page
const loadAddProductPage = async (req, res) => {
    try {
        const brands = await Brand.find({ status: true }).select('_id name');
        const categories = await Category.find({ isListed: true }).select('_id name');

        return res.render('product/addProduct', { brands, categories }); 
    } catch (error) {
        console.error('Error loading add product page:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to load add product page', 
            error: error.message 
        });
    }
};

// Add New Product
const addProduct = async (req, res) => {
    try {
      
        const { name, description, brand, category, variants } = req.body;
    
        if (!name || !description || !brand || !category) {
            return res.status(400).json({success: false,message: 'Name, description, brand, and category are required, please fill it first'});
        }
        if (!variants || !Array.isArray(variants) || variants.length === 0) {
            return res.status(400).json({success: false,message: 'At least one variant is required'});
        }

        const existingProduct = await Product.findOne({ 
            name: new RegExp(`^${name}$`, 'i') 
        });
        if (existingProduct) {
            return res.status(409).json({success: false,message: 'Product with this name already exists'});
        }

        const brandExists = await Brand.findById(brand);
        const categoryExists = await Category.findById(category);

        if (!brandExists || !categoryExists) {
            return res.status(400).json({success: false,message: 'Invalid brand selectedb or Invalid category selected'});
        }
        
        const processedVariants = [];
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            
            if (!variant.quantity || !variant.regularPrice || !variant.manufacturingDate || !variant.uom) {
                return res.status(400).json({success: false,message: `Variant ${i + 1}: Quantity, regular price, manufacturing date, and UOM are required`});
            }
            
            const mfgDate = new Date(variant.manufacturingDate);
            const expDate = variant.expiryDate ? new Date(variant.expiryDate) : null;
            
            if (expDate && expDate <= mfgDate) {
                return res.status(400).json({success: false,message: `Variant ${i + 1}: Expiry date must be after manufacturing date`});
            }
            if (variant.salesPrice && parseFloat(variant.salesPrice) > parseFloat(variant.regularPrice)) {
                return res.status(400).json({success: false,message: `Variant ${i + 1}: Sales price must be less than or equal to regular price`});
            }

            const variantImages = [];
            const imageFiles = req.files.filter(file => 
                file.fieldname === `variants[${i}][variant_${i}_images]`
            );
            if (imageFiles.length < 3 || imageFiles.length > 6) {
                return res.status(400).json({success: false, message: `Variant ${i + 1}: Minimum 3 images & maximum 6 images required. Found: ${imageFiles.length}`});
            }

            for (const file of imageFiles) {
                try {
                    const uploadResult = await uploadImage(file.path, {
                        folder: `carezon/products/${name}/variant_${i + 1}`,
                        transformation: [
                            { width: 800, height: 800, crop: 'limit' },
                            { quality: 'auto' }
                        ]
                    });
                    if (uploadResult.success) {
                        variantImages.push({
                            public_id: uploadResult.public_id,
                            url: uploadResult.url,
                            altText: `${name} - Variant ${i + 1}`
                        });
                    } else {
                        throw new Error(uploadResult.error);
                    }

                    // Clean up temporary file
                    try {
                      await fs.unlink(file.path);
                    } catch (err) {
                        if (err.code !== 'ENOENT') console.error(err);
                    }
                } catch (uploadError) {
                    console.error(`Image upload failed for variant ${i + 1}:`, uploadError);
                    return res.status(500).json({success: false,message: `Failed to upload images for variant ${i + 1}: ${uploadError.message}`});
                }
            }
            // Process attributes
            const attributes = {};
            if (variant.attributes) {
                Object.keys(variant.attributes).forEach(key => {
                    if (variant.attributes[key] && variant.attributes[key].trim()) {
                        attributes[key] = variant.attributes[key].trim();
                    }
                });
            }
            // Build processed variant
            const processedVariant = {
                quantity: parseInt(variant.quantity),
                stock: parseInt(variant.quantity) ,
                regularPrice: parseFloat(variant.regularPrice),
                salesPrice: variant.salesPrice ? parseFloat(variant.salesPrice) : parseFloat(variant.regularPrice),
                manufacturingDate: mfgDate,
                expiryDate: expDate,
                uom: variant.uom.trim(),
                // prescriptionRequired: variant.prescriptionRequired,
                prescriptionRequired: variant.prescriptionRequired === 'true',
                isListed: variant.isListed === 'true',
                discountStatus: variant.discountStatus === 'true',
                offerStatus: variant.offerStatus === 'true',
                attributes: attributes,
                images: variantImages
            };

            if (processedVariant.discountStatus && processedVariant.offerStatus) {
                return res.status(400).json({success: false,message: `Variant ${i + 1}: Cannot have both discount and offer status active`});
            }
            processedVariants.push(processedVariant);
        }
        
        const newProduct = new Product({
            name: name.trim(),
            description: description.trim(),
            brand: brand,
            category: category,
            variants: processedVariants
        });
        const savedProduct = await newProduct.save();

        return res.status(201).json({success: true,message: 'Product added successfully : ',product: {id: savedProduct._id,  name: savedProduct.name,  variantCount: savedProduct.variants.length}});

    } catch (error) {
        console.error('Error adding product:', error);
        // Clean up uploaded files in case of error
        if (req.files) {
            for (const file of req.files) {
                try {
                  await fs.unlink(file.path);
                } catch (err) {
                if (err.code !== 'ENOENT') console.error(err);
                }
            }
        }
        return res.status(500).json({success: false,message: 'Failed to add product'});
    }
};

// Load Edit Product Page
const loadEditProductPage = async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await Product.findById(id).populate('brand', '_id name status').populate('category', '_id name isListed');    
        if (!product) {
            return res.status(404).json({success: false,  message: 'Product not found'});
        }

        const brands = await Brand.find({ status: true }).select('_id name');
        const categories = await Category.find({ isListed: true }).select('_id name');
    
        if(!product.brand || !product.category){
            return res.status(400).json({success: false, message: "Product is missing brand or category information"});
        }

        return res.render('product/editProduct', { product, brands, categories });
    } catch (error) {
        console.error('Error loading  product edit page:', error);
        return res.status(500).json({success: false, message: 'Failed to load  product edit page'});
    }
};

// Update Product
const editProduct = async (req, res) => {
    try {
        const {name, description, brand, category, variants, _id} = req.body;

        if(!name || !description || !brand || !category || !_id){
            return res.status(400).json({success: false, message: "Product ID, Name, Description, Brand, and Category are Required, Please fill it first"});
        }

        if(!variants || !Array.isArray(variants) || variants.length === 0){
            return res.status(400).json({success: false, message: "At least one variant is required"});
        }

        const existingProduct = await Product.findById(_id);
        if(!existingProduct){
            return res.status(404).json({success: false, message: "product not found"});
        }

        const duplicateProduct = await Product.findOne({name: new RegExp(`^${name}$`, 'i'), _id: {$ne: _id}});
        if(duplicateProduct){
            return res.status(409).json({success: false, message: "Another product with this name is already exist"});
        }

        const brandExists = await Brand.findById(brand);
        const categoryExists = await Category.findById(category);
        if(!brandExists || !categoryExists){
            return res.status(400).json({success: false, message: "Invalid brand or category"});
        }

        //process each variants
        const processedVariants = []
         const removedImages = []; // Track which images to delete
        for(let i = 0; i < variants.length; i++){
            const variant = variants[i];

            if(!variant.quantity || !variant.regularPrice || !variant.manufacturingDate || !variant.uom){
                return res.status(400).json({success: false, message: `variant ${i + 1} : quantity, regular price, manufacturing date, and uom are required`});
            }

            const mfgDate = new Date(variant.manufacturingDate);
            const expDate = variant.expiryDate ? new Date(variant.expiryDate) : null;
            if(expDate && expDate <= mfgDate){
                return res.status(400).json({success: false, message: `Variant ${i + 1} : Expiry date must be greater than manufacturing date`});
            }

            if(variant.salesPrice && parseFloat(variant.salesPrice) > parseFloat(variant.regularPrice)){
                return res.status(400).json({success: false, message: `Variant ${i + 1} : Sales price must be less than or equal to regular price.`});
            }

            const variantImages = [];
            const imageFiles = req.files.filter(file => file.fieldname === `variants[${i}][variant_${i}_images]`);

            //validate images count
            const existingImageCount = variant.existingImages ? variant.existingImages.length : 0;
            const newImageCount = imageFiles.length;
            const totalImages = existingImageCount + newImageCount;

            if(totalImages < 3 || totalImages > 6){
                return res.status(400).json({success: false, message: `Variant ${i + 1} : Minimum 3 images & maximum 6 images required. Current: ${totalImages}`});
            }

            //Keep existing images if provided
            const existingImages = variant.existingImages || [];
            if (existingImages.length > 0) {
                const existingVariant = existingProduct.variants[i] || {};
                if (existingVariant.images && Array.isArray(existingVariant.images)) {
                    // Keep only images that are still in existingImages array
                    existingVariant.images.forEach(image => {
                        const imageUrl = image.url || image.secure_url;
                        if (existingImages.includes(imageUrl)) {
                            // Find corresponding alt text
                            const imageIndex = existingImages.indexOf(imageUrl);
                            const altText = variant.imageAltText && variant.imageAltText[imageIndex] 
                                ? variant.imageAltText[imageIndex] 
                                : `${name} - Variant ${i + 1}`;
                            
                            variantImages.push({
                                public_id: image.public_id,
                                url: imageUrl,
                                altText: altText
                            });
                        } else {
                            // Image was removed, mark for deletion
                            if (image.public_id) {
                                removedImages.push(image.public_id);
                            }
                        }
                    });
                }
            }

            //upload new images
            for(const file of imageFiles){
                try {
                    const uploadResult = await uploadImage(file.path, {
                        folder: `carezon/products/${name}/variant_${i + 1}`,
                        transformation: [
                            {width: 800, height: 800, crop: 'limit'},
                            {quality: 'auto'}
                        ]
                    });
                    if(uploadResult.success){
                        variantImages.push({
                            public_id: uploadResult.public_id,
                            url: uploadResult.url,
                            altText: `${name} - Variant ${i + 1}`
                        });
                    }else{
                        throw new Error(uploadResult.error);
                    }
                    //clean up temporary file
                    try {
                        await fs.unlink(file.path);
                    } catch (error) {
                        if (error.code !== 'ENOENT') console.error("clean up temp file error : ", error);
                    }
                } catch (uploadError) {
                    console.error(`Image upload failed for Variant ${i + 1} : `, uploadError);
                    return res.status(500).json({success: false, messsge: `Failed to upload images for variant ${i + 1} : ${uploadError.message}`});
                }
            }
            //process attributes
            const attributes = {};
            if(variant.attributes){
                Object.keys(variant.attributes).forEach(key => {
                    if(variant.attributes[key] && variant.attributes[key].trim()){
                        attributes[key] = variant.attributes[key].trim();
                    }
                })
            }
            //Build processed variant
            const processedVariant = {
                quantity: parseInt(variant.quantity),
                stock: parseInt(variant.quantity),
                regularPrice: parseFloat(variant.regularPrice),
                salesPrice: variant.salesPrice ? parseFloat(variant.salesPrice) : parseFloat(variant.regularPrice),
                manufacturingDate: mfgDate,
                expiryDate: expDate,
                uom: variant.uom,
                prescriptionRequired: variant.prescriptionRequired === 'true',
                isListed: variant.isListed === 'true',
                discountStatus: variant.discountStatus === 'true',
                offerStatus: variant.offerStatus === 'true',
                attributes: attributes,
                images: variantImages
            };
            processedVariants.push(processedVariant);
        }

       //Delete only manually removed images (from cloudinary)
        for (const publicId of removedImages) {
            try {
                await deleteImage(publicId);
            } catch (err) {
                console.error(`Failed to delete image ${publicId}:`, err);
            }
        }

        existingProduct.name = name.trim();
        existingProduct.description = description.trim();
        existingProduct.brand = brand;
        existingProduct.category = category;
        existingProduct.variants = processedVariants;
        existingProduct.updatedAt = new Date();

        const updatedProduct = await existingProduct.save();

        return res.status(200).json({
            success: true, message: "product updated successfully",
            product: {
                id: updatedProduct._id,
                name: updatedProduct.name,
                variantCount: updatedProduct.variants.length
            }
        });

    } catch (error) {
        console.error('Error updating product:', error);
        // Clean up uploaded files in case of error
        if (req.files) {
            for (const file of req.files) {
                try {
                    await fs.unlink(file.path);
                } catch (err) {
                    if (err.code !== 'ENOENT') console.error(err);
                }
            }
        }
        return res.status(500).json({success: false, message: 'Failed to update product'});
    }
};

const viewProductDetails = async (req,res) => {
    try {
        const product = await Product.findById(req.params.id).populate('brand', 'name').populate('category', 'name').lean();

        if(!product){
            return res.status(404).json({success: false, message: "product not found, please try again"});
        }
        res.json({success: true, product})
    } catch (error) {
        console.error("error fetching product details : ", error);
        res.status(500).json({success: false, message: "failed to fetch product details"});
    }
}


const productStatus = async (req,res) => {
    try {
        const {id} = req.params;
        const {variants} = req.body;
        
        const product = await Product.findById(id);
        if(!product){
            return res.status(404).json({success: false, message: "Product not found"});
        }

        //update individual variant statuses
        let updatedCount = 0;
        variants.forEach(variantUpdate => {
            const variantIndex = product.variants.findIndex(v => v._id.toString() === variantUpdate.variantId.toString());

            if(variantIndex !== -1){
                product.variants[variantIndex].isListed = variantUpdate.isListed;
                updatedCount++;
            }
        });
        if(updatedCount === 0){
            return res.status(400).json({success: false, message: "no variants were updated"});
        }

        await product.save();

        return res.status(200).json({success: true, message: `${updatedCount} variant${updatedCount > 1 ? 's' : ''} updated successfully`, updatedCount});


    } catch (error) {
        console.error("Error updating variant statuses:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const searchProduct =  async (req,res) => {
    try {
        const search = req.query.search?.trim() || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = search ? {name: {$regex: search, $options: 'i'}} : {};

        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);

        const products = await Product.find(filter).sort({createdAt: -1}).skip(skip).limit(limit).populate('brand', 'name').populate('category', 'name').lean();
        if(products.length === 0){
            return res.status(404).json({success: false, message: "No Product found"});
        }

        const formattedProducts = products.map(product => {
            const activeVariant = product.variants.find(v => v.isListed) || product.variants[0];

            return {
                _id: product._id,
                name: product.name,
                brand: product.brand,
                category: product.category,
                regularPrice: activeVariant.regularPrice,
                salesPrice: activeVariant.salesPrice,
                stock: activeVariant.stock
            }
        });

        return res.status(200).json({success: true, products: formattedProducts, currentPage: page, totalPages, totalProducts});

    } catch (error) {
        console.error("product search get error", error);
        return res.status(500).json({success: false, message: "Internal server error"});
    }
}

module.exports = {
    loadProductListPage,
    loadAddProductPage,
    addProduct,
    loadEditProductPage,
    editProduct,
    viewProductDetails,
    productStatus,
    searchProduct
};