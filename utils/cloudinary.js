const cloudinary = require('cloudinary').v2;
const env = require('dotenv').config();

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Test connection
const testConnection = async () => {
    try {
        const result = await cloudinary.api.ping();
        return true;
    } catch (error) {
        console.error('Cloudinary connection failed:', error);
        return false;
    }
};

// Upload image
const uploadImage = async (filePath, options = {}) => {
    try {
        const defaultOptions = {
            resource_type: 'image',
            folder: 'carezon',
            quality: 'auto',
            fetch_format: 'auto'
        };

        const mergedOptions = { ...defaultOptions, ...options };
        const result = await cloudinary.uploader.upload(filePath, mergedOptions);

        return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        return { success: false, error: error.message };
    }
};

// Delete image
const deleteImage = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return {
            success: result.result === 'ok',
            result: result.result
        };
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return { success: false, error: error.message };
    }
};

// Get image info
const getImageInfo = async (publicId) => {
    try {
        const result = await cloudinary.api.resource(publicId);
        return { success: true, data: result };
    } catch (error) {
        console.error('Cloudinary get image info error:', error);
        return { success: false, error: error.message };
    }
};

// Generate optimized URL
const generateOptimizedUrl = (publicId, options = {}) => {
    const defaultOptions = {
        quality: 'auto',
        fetch_format: 'auto'
    };

    const mergedOptions = { ...defaultOptions, ...options };
    return cloudinary.url(publicId, mergedOptions);
};

testConnection();

module.exports = {
    cloudinary,
    uploadImage,
    deleteImage,
    getImageInfo,
    generateOptimizedUrl
};