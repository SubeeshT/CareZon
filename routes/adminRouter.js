const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const brandController = require('../controllers/admin/brandController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const salesReportController = require('../controllers/admin/salesReportController');
const prescriptionController = require('../controllers/admin/prescriptionController');
const dashboardController = require('../controllers/admin/dashboardController');
const auth = require('../middlewares/auth');
const uploadConfigs  = require('../utils/multerConfig');


//Admin auth section
router.get('/signIn', adminController.loadSignIn);
router.post('/signIn', adminController.signIn);
router.get('/logout', adminController.logout);

//Dashboard section
router.get('/dashboard', auth.isAdminLoggedIn, dashboardController.loadDashboard);
router.get('/dashboard/download/pdf', auth.isAdminLoggedIn, dashboardController.downloadLedgerPDF);
router.get('/dashboard/download/excel', auth.isAdminLoggedIn, dashboardController.downloadLedgerExcel);

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

//order management section
router.get('/orders', auth.isAdminLoggedIn, orderController.loadOrder);
router.patch('/order/status/:id', auth.isAdminLoggedIn, orderController.updateOrderStatus);
router.patch('/order/return/:id', auth.isAdminLoggedIn, orderController.updateReturnOrder);
router.get('/order/viewFullDetails/:id', auth.isAdminLoggedIn, orderController.orderFullDetails);

//coupon management
router.get('/coupons', auth.isAdminLoggedIn, couponController.loadCoupons);
router.post('/coupons/add', auth.isAdminLoggedIn, couponController.addCoupon);
router.put('/coupons/edit/:id', auth.isAdminLoggedIn, couponController.editCoupon);
router.patch('/coupons/status/:id', auth.isAdminLoggedIn, couponController.changeStatus);
router.delete('/coupons/delete/:id', auth.isAdminLoggedIn, couponController.deleteCoupon);

//sales report
router.get('/sales-report', auth.isAdminLoggedIn, salesReportController.getSalesReportData);

//prescription section
router.get('/prescription', auth.isAdminLoggedIn, prescriptionController.loadPrescriptionRequests);
router.patch('/prescription/status-change', auth.isAdminLoggedIn, prescriptionController.verifyPrescription);


module.exports = router;
