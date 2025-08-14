const express = require('express')
const router = express.Router()
const authController = require('../controllers/user/userController')
const shopController = require('../controllers/user/productController')
const productDetailsController = require('../controllers/user/productDetaliController');
const auth = require('../middlewares/auth')
const passport = require('passport')


//auth section

router.get('/signUp', authController.loadSignUp);
router.post('/signUp', authController.signUp);
router.get('/verifyOtp',authController.loadOtp);
router.post('/verifyOtp', authController.verifyOTP);
router.post('/resendOtp', authController.resendOTP);
router.get('/signIn', authController.loadSignIn);
router.post('/signIn', authController.signIn);
router.get('/logOut', auth.isUserLoggedIn, authController.logOut);
router.get('/changePassword', authController.loadForgotPassword)
router.post('/changePassword', authController.forgotPassword)
router.patch('/changePassword', authController.forgotPassword)
router.post('/resendOTPResetPassword', authController.resendOTPResetPassword)
router.get('/auth/google', passport.authenticate('google', {scope: ['profile', 'email']})); //start google oauth login
router.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/signUp'}), //google oauth callbak
(req,res) => {
    if(req.user.isBlocked){
        return res.redirect('/signIn?error=blocked');
    }
    req.session.userId = req.user._id;
    console.log(`loged user is ${req.user.fullName} by google`)
    res.redirect('/home')
})

//Landing page
router.get('/', shopController.loadHomePage);
//home page
router.get('/home', shopController.loadHomePage);
//Product sho page
router.get('/products/shop', shopController.loadShopPage);
router.get('/products/search-suggestions', shopController.getSearchSuggestions);
//product details page
router.get('/products/details/:id', productDetailsController.getProductDetails);



module.exports = router
