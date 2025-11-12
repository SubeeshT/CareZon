const express = require('express');
const router = express.Router();
const authController = require('../controllers/user/userController');
const shopController = require('../controllers/user/productController');
const productDetailsController = require('../controllers/user/productDetailsController');
const profileController = require('../controllers/user/ProfileController');
const addressController = require('../controllers/user/addressController');
const cartController = require('../controllers/user/cartController');
const checkoutController = require('../controllers/user/checkoutController');
const orderController =  require('../controllers/user/orderController');
const wishlistController = require('../controllers/user/wishlistController');
const walletController = require('../controllers/user/walletController');
const auth = require('../middlewares/auth');
const passport = require('passport');
const uploadConfigs = require('../utils/multerConfig');


//auth section

router.get('/signUp', authController.loadSignUp);
router.post('/signUp', authController.signUp);
router.get('/verifyOtp',authController.loadOtp);
router.post('/verifyOtp', authController.verifyOTP);
router.post('/resendOtp', authController.resendOTP);
router.get('/signIn', authController.loadSignIn);
router.post('/signIn', authController.signIn);
router.get('/logOut', auth.isUserLoggedInWithUserData, authController.logOut);
router.get('/changePassword', authController.loadForgotPassword);
router.post('/changePassword', authController.forgotPassword);
router.patch('/changePassword', authController.forgotPassword);
router.post('/resendOTPResetPassword', authController.resendOTPResetPassword)
router.get('/auth/google', passport.authenticate('google', {scope: ['profile', 'email']})); //start google oauth login
router.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/signUp', keepSessionInfo: true}), authController.googleAuthCallback); //google oauth callBack

//Landing page
router.get('/', auth.getUserData, shopController.loadHomePage);
//home page
router.get('/home', auth.getUserData, shopController.loadHomePage);
//Product shop page
router.get('/products/shop', auth.getUserData, shopController.loadShopPage);
router.get('/products/search-suggestions', auth.getUserData, shopController.getSearchSuggestions);

//product details page
router.get('/products/details/:id', auth.getUserData, productDetailsController.getProductDetails);
router.post('/cart/prescription', auth.validateActiveUser, uploadConfigs.prescriptionImage.single('prescriptionFile'), productDetailsController.uploadPrescription);
router.get('/prescription/status/:productId/:variantId', auth.validateActiveUser, productDetailsController.getPrescriptionStatus);


//user account/Profile section
router.get('/profile', auth.validateActiveUser, profileController.loadProfile);
router.put('/profile/editDetails', auth.validateActiveUser, profileController.editUserDetails);
router.put('/profile/initialEmailChange', auth.validateActiveUser, profileController.initiateEmailChange);
router.post('/profile/verifyCurrentEmail', auth.validateActiveUser, profileController.verifyCurrentEmail);
router.post('/profile/sendOtp', auth.validateActiveUser, profileController.sendOtp);
router.post('/profile/verifyNewEmail', auth.validateActiveUser, profileController.verifyNewEmailAndSave);
router.post('/profile/resendOtp', auth.validateActiveUser, profileController.resendOTP);
router.put('/profile/changePassword', auth.validateActiveUser, profileController.changePassword);
router.post('/profile/uploadImage', auth.validateActiveUser, uploadConfigs.profileImage.single('profileImage'), profileController.uploadProfileImage);

//user account/address section
router.get('/account/address', auth.validateActiveUser, addressController.loadAddress);
router.post('/account/address/add', auth.validateActiveUser, addressController.addAddress);
router.put('/account/address/edit/:addressId', auth.validateActiveUser, addressController.editAddress);
router.patch('/account/address/default/:addressId', auth.validateActiveUser, addressController.setDefaultAddress);
router.delete('/account/address/delete/:addressId', auth.validateActiveUser, addressController.deleteAddress);


//user cart  section
router.get('/cart', auth.validateActiveUser, cartController.loadCart);
router.post('/cart/add',auth.validateActiveUser, cartController.addToCart);
router.delete('/cart/remove', auth.validateActiveUser, cartController.removeFromCart);
router.patch('/cart/updateQuantity', auth.validateActiveUser, cartController.updateCartQuantity);
router.get('/cart/count', auth.validateActiveUser, cartController.getCartCount);


//user checkout section
router.get('/cart/checkout', auth.validateActiveUser, checkoutController.loadCheckout);
router.post('/order/create-razorpay-order', auth.validateActiveUser, checkoutController.createRazorpayOrder);
router.post('/order/verify-payment', auth.validateActiveUser, checkoutController.verifyPayment);
router.post('/order/place', auth.validateActiveUser, checkoutController.placeOrder);
router.get('/account/wallet/balance', auth.validateActiveUser, checkoutController.getWalletBalance);
router.get('/cart/coupons', auth.validateActiveUser, checkoutController.getCoupons);
router.post('/cart/apply-coupon', auth.validateActiveUser, checkoutController.applyCoupon);
router.post('/order/place-failed', auth.validateActiveUser, checkoutController.placeFailedPaymentOrder);
router.post('/order/retry-payment', auth.validateActiveUser, checkoutController.retryPayment);

//order section
router.get('/account/orders/details/:orderId', auth.validateActiveUser, orderController.loadOrderedProductsDetails);
router.patch('/account/orders/cancel/:orderId', auth.validateActiveUser, orderController.cancelOrder);
router.get('/account/orders', auth.validateActiveUser, orderController.loadOrdersList);
router.post('/account/orders/return/:orderId', auth.validateActiveUser, orderController.returnOrder);
router.get('/account/orders/invoice/:orderId', auth.validateActiveUser, orderController.downloadInvoice);

//Wishlist section
router.get('/account/wishlists', auth.validateActiveUser, wishlistController.loadWishlist);
router.post('/account/wishlist/add/:productId/:variantId', auth.validateActiveUser, wishlistController.addToWishlist);
router.delete('/account/wishlist/delete/:variantId', auth.validateActiveUser, wishlistController.removeFromWishlist);
router.get('/account/wishlist/check/:productId/:variantId', auth.validateActiveUser, wishlistController.checkWishlistStatus);

//wallet section
router.get('/account/wallet', auth.validateActiveUser, walletController.loadWallet);
router.post('/wallet/create-order', auth.validateActiveUser, walletController.createRazorpayOrder);
router.post('/wallet/verify-payment', auth.validateActiveUser, walletController.verifyPaymentAndAddMoney);
router.post('/wallet/payment-failed', auth.validateActiveUser, walletController.handlePaymentFailure);

module.exports = router
