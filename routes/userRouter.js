const express = require('express')
const router = express.Router()
const controllers = require('../controllers/user/userController')

router.get('/pageNotFound', controllers.pageNotFound)

router.get('/', controllers.loadHome)
router.get('/signUp', controllers.loadSignUp)
router.post('/signUp', controllers.signUp)
router.get('/verifyOtp',controllers.loadOtp)
router.post('/verifyOtp', controllers.verifyOTP)
router.post('/resendOtp', controllers.resendOTP)
router.get('/signIn',controllers.loadSignIn)
router.post('/signIn',controllers.signIn)

module.exports = router
