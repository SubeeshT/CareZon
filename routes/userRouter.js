const express = require('express')
const router = express.Router()
const controllers = require('../controllers/user/userController')
const auth = require('../middlewares/auth')
const passport = require('passport')

//router.get('/pageNotFound', controllers.pageNotFound)

//auth section
router.get('/', controllers.loadLanding);
router.get('/signUp', controllers.loadSignUp);
router.post('/signUp', controllers.signUp);
router.get('/verifyOtp',controllers.loadOtp);
router.post('/verifyOtp', controllers.verifyOTP);
router.post('/resendOtp', controllers.resendOTP);
router.get('/signIn', controllers.loadSignIn);
router.post('/signIn', controllers.signIn);
router.get('/home', auth.isUserLoggedIn, controllers.loadHome);
router.get('/logOut', auth.isUserLoggedIn, controllers.logOut);
router.get('/changePassword', controllers.loadForgotPassword)
router.post('/changePassword', controllers.forgotPassword)
router.patch('/changePassword', controllers.forgotPassword)
router.post('/resendOTPResetPassword', controllers.resendOTPResetPassword)
router.get('/auth/google', passport.authenticate('google', {scope: ['profile', 'email']})); //start google oauth login
router.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/signUp'}), //google oauth callbak
(req,res) => {
    req.session.userId = req.user._id;
    res.redirect('/home')
})


//shop/product section
router.get('/product',auth.isUserLoggedIn, controllers.loadProduct)


module.exports = router
