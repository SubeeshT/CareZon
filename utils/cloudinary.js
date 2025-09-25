const cloudinary = require('cloudinary').v2;
const env = require('dotenv').config();

//cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

//for test connection
const testConnection = async () => {
    try {
        const result = await cloudinary.api.ping();
        return true;
    } catch (error) {
        console.error('Cloudinary connection failed:', error);
        return false;
    }
};

//for delete image 
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


testConnection();

module.exports = {
    cloudinary,
    deleteImage,
};