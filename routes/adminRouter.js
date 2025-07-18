const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const brandController = require('../controllers/admin/brandController');
const productController = require('../controllers/admin/productController');
const auth = require('../middlewares/auth');
const upload = require('../utils/multerConfig');


// Admin auth section
router.get('/signIn', adminController.loadSignIn);
router.post('/signIn', adminController.signIn);
router.get('/logout', adminController.logout);

// Dashboard section
router.get('/dashboard', auth.isAdminLoggedIn, adminController.loadDashboard);


// Users management section
router.get('/users', auth.isAdminLoggedIn, userController.getUsers);
router.get('/users/search', auth.isAdminLoggedIn, userController.searchUsers); 
router.get('/users/suggestions', auth.isAdminLoggedIn, userController.getSearchSuggestions);
router.patch('/users/:id/block', auth.isAdminLoggedIn, userController.blockUser);
router.patch('/users/:id/unblock', auth.isAdminLoggedIn, userController.unblockUser);
router.patch('/users/:id/status', auth.isAdminLoggedIn, userController.toggleUserStatus);


// Category management section
router.get('/categories', auth.isAdminLoggedIn, categoryController.getCategories);
router.post('/categories', auth.isAdminLoggedIn, categoryController.addCategory);
router.put('/categories/:id', auth.isAdminLoggedIn, categoryController.updateCategory);
router.patch('/categories/:id/status', auth.isAdminLoggedIn, categoryController.toggleCategoryStatus);
router.patch('/categories/:id/discount-status', auth.isAdminLoggedIn, categoryController.toggleDiscountStatus);

// Brand management section
router.get('/brands', auth.isAdminLoggedIn, brandController.loadBrand);
router.get('/brands/search', auth.isAdminLoggedIn, brandController.searchBrands);
router.get('/brands/:brandId', auth.isAdminLoggedIn, brandController.getBrandById);
router.post('/brands', auth.isAdminLoggedIn, upload.brandLogo.single('logo'), brandController.createBrand);
router.put('/brands/:brandId', auth.isAdminLoggedIn, upload.brandLogo.single('logo'), brandController.updateBrand);
router.patch('/brands/:brandId/status', auth.isAdminLoggedIn, brandController.toggleBrandStatus);

// product management section
router.get('/products', auth.isAdminLoggedIn, productController.loadProduct);
router.get('/productAdd', auth.isAdminLoggedIn, productController.loadAddProduct);
router.get('/productEdit', auth.isAdminLoggedIn, productController.loadEditProduct);


module.exports = router;