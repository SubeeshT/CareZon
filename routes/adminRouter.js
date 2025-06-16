const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const auth = require('../middlewares/auth');

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


// Category management routes
//router.get('/categories', auth.isAdminLoggedIn, categoryController.loadCategory);
router.get('/categories', auth.isAdminLoggedIn, categoryController.getCategories);
router.post('/categories', auth.isAdminLoggedIn, categoryController.addCategory);
router.put('/categories/:id', auth.isAdminLoggedIn, categoryController.updateCategory);
router.patch('/categories/:id/status', auth.isAdminLoggedIn, categoryController.toggleCategoryStatus);
router.patch('/categories/:id/offer-status', auth.isAdminLoggedIn, categoryController.toggleOfferStatus);


module.exports = router;