const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory
const uploadDir = 'uploads/temp';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter for images
const imageFilter = (req, file, cb) => {
   
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

// File filter for documents
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
};

// Upload configurations
const uploadConfigs = {
    brandLogo: multer({
        storage: storage,
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB
            files: 1
        }
    }),
    productImage: multer({
        storage: storage,
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB
            files: 30 // Max 6 images per variant, up to 5 variants
        }
    }).any(),
    
    generalImage: multer({
        storage: storage,
        fileFilter: imageFilter,
        limits: {
            fileSize: 5 * 1024 * 1024, // 5MB;
            files: 1
        }
    }),
    documents: multer({
        storage: storage,
        fileFilter: documentFilter,
        limits: {
            fileSize: 20 * 1024 * 1024, // 20MB
            files: 1
        }
    })
};

module.exports = uploadConfigs;