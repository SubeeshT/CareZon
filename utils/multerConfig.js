const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('./cloudinary');

//file filters for only images
const imageFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
}

//document filter , accept only PDF/Word docs
const documentFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF and Word documents are allowed'), false);
    }
}

//create cloudinary storage as separate folders 
const createCloudinaryStorage = (folder, transformations = []) => {
    return new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: folder,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: transformations,
        },
    });
}

//upload configurations with inline storage creation
const uploadConfigs = {
    brandLogo: multer({
        storage: createCloudinaryStorage('carezon/brands', [
            { width: 300, height: 300, crop: 'limit' },
            { quality: 'auto' }
        ]),
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, //5MB
            files: 1
        }
    }),
    
    productImage: multer({
        storage: createCloudinaryStorage('carezon/products', [
            { width: 800, height: 800, crop: 'limit' },
            { quality: 'auto' }
        ]),
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, //5MB
            files: 30
        }
    }).any(),

    prescriptionImage: multer({
        storage: createCloudinaryStorage('carezon/prescriptions', [
            { width: 1000, height: 1000, crop: 'limit' },
            { quality: 'auto' }
        ]),
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, //5MB
            files: 1
        }
    }),

    profileImage: multer({
        storage: createCloudinaryStorage('carezon/profileImages', [
            {width: 500, height: 500, crop: 'limit'},
            {quality: 'auto'}
        ]),
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, //5MB
            files: 1
        }
    }),
    
    generalImage: multer({
        storage: createCloudinaryStorage('carezon/general', [
            { width: 500, height: 500, crop: 'limit' },
            { quality: 'auto' }
        ]),
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, //5MB
            files: 1
        }
    }),
    
    documents: multer({
        storage: createCloudinaryStorage('carezon/documents'), 
        fileFilter: documentFilter,
        limits: {
            fileSize: 20 * 1024 * 1024, //20MB
            files: 1
        }
    })
};

module.exports = uploadConfigs;