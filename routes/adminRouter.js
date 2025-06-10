const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController')
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

// Individual user status management
router.patch('/users/:id/block', auth.isAdminLoggedIn, userController.blockUser);
router.patch('/users/:id/unblock', auth.isAdminLoggedIn, userController.unblockUser);

// Combined status toggle endpoint
router.patch('/users/:id/status', auth.isAdminLoggedIn, userController.toggleUserStatus);

// Alternative route patterns for compatibility
router.patch('/users/block/:id', auth.isAdminLoggedIn, userController.blockUser);
router.patch('/users/unblock/:id', auth.isAdminLoggedIn, userController.unblockUser);

// Customer endpoints (aliases for users)
// router.get('/customers', auth.isAdminLoggedIn, userController.getUsers);
// router.get('/customers/search', auth.isAdminLoggedIn, userController.searchUsers);
// router.patch('/customers/:id/status', auth.isAdminLoggedIn, userController.toggleUserStatus);

// Category management
router.get('/categorys', auth.isAdminLoggedIn, categoryController.loadCategory);

module.exports = router;