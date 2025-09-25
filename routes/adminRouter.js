const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const brandController = require('../controllers/admin/brandController');
const productController = require('../controllers/admin/productController');
const auth = require('../middlewares/auth');
const uploadConfigs  = require('../utils/multerConfig');


//Admin auth section
router.get('/signIn', adminController.loadSignIn);
router.post('/signIn', adminController.signIn);
router.get('/logout', adminController.logout);

//Dashboard section
router.get('/dashboard', auth.isAdminLoggedIn, adminController.loadDashboard);

// Users management section
router.get('/users', auth.isAdminLoggedIn, userController.getUsers);
router.patch('/users/status/:id', auth.isAdminLoggedIn, userController.toggleUserStatus);


//Category management section
router.get('/categories', auth.isAdminLoggedIn, categoryController.getCategories);
router.post('/categories', auth.isAdminLoggedIn, categoryController.addCategory);
router.put('/categories/:id', auth.isAdminLoggedIn, categoryController.updateCategory);
router.patch('/categories/:id/status', auth.isAdminLoggedIn, categoryController.toggleCategoryStatus);
router.patch('/categories/:id/discount-status', auth.isAdminLoggedIn, categoryController.toggleDiscountStatus);

//Brand management section
router.get('/brands', auth.isAdminLoggedIn, brandController.loadBrand);
router.post('/brands', auth.isAdminLoggedIn, uploadConfigs.brandLogo.single('logo'), brandController.createBrand);
router.put('/brands/:brandId', auth.isAdminLoggedIn, uploadConfigs.brandLogo.single('logo'), brandController.updateBrand);
router.patch('/brands/:brandId/status', auth.isAdminLoggedIn, brandController.toggleBrandStatus);

//Product management section
router.get('/products', auth.isAdminLoggedIn, productController.loadProductListPage);
router.get('/products/add', auth.isAdminLoggedIn, productController.loadAddProductPage);
router.post('/products/add', auth.isAdminLoggedIn, uploadConfigs.productImage, productController.addProduct);
router.get('/products/details/:id', auth.isAdminLoggedIn, productController.viewProductDetails);
router.get('/products/edit/:id', auth.isAdminLoggedIn, productController.loadEditProductPage);
router.put('/products/edit/:id', auth.isAdminLoggedIn, uploadConfigs.productImage, productController.editProduct);
router.patch('/products/status/:id', auth.isAdminLoggedIn, productController.productStatus);



module.exports = router;