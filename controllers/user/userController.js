const session = require('express-session')
const User = require('../../models/userSchema')
const bcrypt = require('bcryptjs')
const sendOTPEmail = (require('../../utils/sendEmail'))


const loadSignUp = async (req,res) => {
    try {
         if(req.session.userId){
            return res.redirect('/home')
        }
        return res.render('auth/userSignUp')
    } catch (error) {
        console.log("failed to load signUP page", error)
        res.status(500).send("servor error")
    }
}

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

const signUp = async (req,res) => {
    try {
        const {fullName, email, phone, password, confirmPassword} = req.body 
        
        if(!fullName || !email || !phone || !password || !confirmPassword){
            return res.status(400).json({message : "All fields are required"})
        }

        if(password !== confirmPassword){
            return res.status(400).json({message : "Passwords do not match"});
        }

        const existingUser = await User.findOne({ $or: [{email}, {phone}] })
        if (existingUser){
            return res.status(400).json({message: "Email or phone already exists"})
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const otp = generateOTP()
        console.log(`OTP is : ${otp}`)
        const otpExpires = new Date(Date.now() + 1 * 60 * 1000)

        req.session.tempUser = {
            fullName,
            email,
            phone,
            password : hashedPassword,
            otp: {
                code: otp,
                expiresAt: otpExpires,
            },
        } 

        await sendOTPEmail(email, otp)

        res.render('auth/userOTP', {
            userId: null, 
            otpExpiresAt: otpExpires.toISOString(),
            error: null
        }); 
        
        
    } catch (error) {
        console.error("Registration failed : ", error)
        res.status(500).json({message: "Server error during signup"})
    }
};

const loadOtp = async (req,res) => {
    try {
        return res.render('auth/userOTP')
    } catch (error) {
        console.log("failed to find userOTP page", error)
        res.status(500).send("failed find OTP page")
    }
}

const verifyOTP = async (req,res) => {
    try {
        const {otp} = req.body
        const tempUser = req.session.tempUser

        if(!tempUser){
            return res.status(400).json({message: "NO OTP session found"})
        }

        const expiresAt = new Date(tempUser.otp.expiresAt);

        // Check if OTP has expired first
        if(expiresAt < new Date()){
           return res.render('auth/userOTP', {
            otpExpiresAt: expiresAt.toISOString(),
            error: "OTP has expired. Please request a new one."
           })
        }

        if(!otp || tempUser.otp.code !== otp){
            return res.render('auth/userOTP', {
                otpExpiresAt: expiresAt.toISOString(),
                error: "Invalid OTP. Please try again."
            })
        }

        const newUser = new User({
            fullName: tempUser.fullName.trim(),
            email: tempUser.email.trim(),
            phone: tempUser.phone.trim(),
            password: tempUser.password.trim(),
            isVerified: true,
        });
        await newUser.save();

        req.session.tempUser = null

        res.redirect('/signIn')

    } catch (error) {
        console.error("OTP verification failed : ",error)
        res.status(500).json({message: "Server error during OTP verification"})
    }
}

const resendOTP = async (req,res) => {
    try {
        const tempUser = req.session.tempUser

        if(!tempUser) {
            return res.status(400).json({
                message: "No active session found. Please restart the registration process.",
                success: false
            })
        }
        // Generate new OTP and update expiration
        const newOTP = generateOTP()
        const newExpiration = new Date(Date.now() + 1 * 60 * 1000)
        
        req.session.tempUser.otp = {
            code: newOTP,
            expiresAt: newExpiration,
        }
        console.log(`New OTP is : ${newOTP}`)
        
        await sendOTPEmail(tempUser.email, newOTP)

        res.status(200).json({
            message: " New OTP resent to your email",
            newExpiresAt: newExpiration.toISOString(),
            success: true
        })
            
    } catch (error) {
        console.error("Resend OTP failed : ", error)
        res.status(500).json({
            message: "Failed to resend OTP, Please try again",
            success: false
    })
    }
}

const loadSignIn = async (req,res) => {
    try {
        if(req.session.userId){
            return res.redirect('/home')
        }
        return res.render('auth/userSignIn')
    } catch (error) {
        console.log("failed to load user signin page", error)
        res.status(500).send("failed to load signin")
    }
}

const signIn = async (req,res) => {
    try {
        const {emailOrPhone, password} = req.body;

        const user = await User.findOne({$or: [{email: emailOrPhone}, {phone: emailOrPhone}]});

        if(!user){
            return res.status(401).json({message: "Not have an account, Please signUP first"});
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password)
        if(!isPasswordMatch){
            return res.status(401).json({message: "Email & Password is not matching"});
        }

        if(user.isBlocked){
            return res.status(403).json({message: "This account is blocked, please contact us."});
        }

        req.session.userId = user._id 
        console.log(`Loged user is : ${user.fullName}`);

        return res.redirect('/home');

    } catch (error) {
        console.error("failed to signIn : ", error);
        return res.status(500).json({message: "failed to signIn, Please try again"});
    }
}

const logOut = (req,res) => {
    req.session.destroy((err) => {
        if(err){
            console.error("Failed to logout : ",err);
            return res.status(500).send("failed to log out, Please try again");
        }
        res.clearCookie('connect.sid');
       return res.redirect('/');
    })
}

const loadForgotPassword = async (req,res) => {
    try {
        return res.render('auth/userForgotPassword')
    } catch (error) {
        console.log('error found to load change password', error)
        return res.status(500).send('failed to load change password page')
    }
}

const forgotPassword = async (req,res) => {
    try {
        const {emailOrPhone, otp, password, step} = req.body

        //----------step 1: send OTP to email/phone----------

        if(!step || step === 'send-otp'){
            if(!emailOrPhone){
                return res.status(400).json({success: false, message: "Email or phone number  is required"})
            }
            const user = await User.findOne({$or: [{email: emailOrPhone}, {phone: emailOrPhone}]})

            if(!user){
                return res.status(404).json({success: false, message: "No user found with this email or phone number"})
            }
            if(user.isBlocked){
                return res.status(403).json({success: false, message: "This account is blocked. Please contact us"})
            }
            const resendOTP = generateOTP()
            const otpExpires = new Date(Date.now() + 1 * 60 * 1000)

            console.log(`Reset password OTP is : ${resendOTP}`)

            req.session.passwordReset = {
                userId: user._id,
                emailOrPhone: emailOrPhone,
                otp: {
                    code: resendOTP,
                    expiresAt: otpExpires,
                },
                isVerified: false,
            }
            await sendOTPEmail(user.email, resendOTP, 'Password Reset')
            return res.status(200).json({success: true, message: "OTP sent successfully to your email", nextStep: "verify-otp"})
        }

        // ----------step 2: Verify OTP----------

        else if(step === 'verify-otp'){
            if(!otp){
                return res.status(400).json({success: false, message: "OTP is required"})
            }
            const resetSession = req.session.passwordReset

            if(!resetSession){
                return res.status(400).json({success: false, message: "No active password reset session found"})
            }
            const expiresAt = new Date(resetSession.otp.expiresAt)

            if(expiresAt < new Date()){
                return res.status(400).json({success: false, message: "OTP has expired. Please request a new one."})
            }

            if(resetSession.otp.code !== otp){
                return res.status(400).json({success: false, message: "Invalid OTP. please try again."})
            }

            req.session.passwordReset.isVerified = true

            return res.status(200).json({success: true, message: "OTP verified successfull", nextStep: "reset-password"})
        }

        // ---------- Step 3: Reset password ----------

        else if(step === 'reset-password'){
            if(!password){
                return res.status(400).json({success: false, message: "New password is required"})
            }

            const resetSession = req.session.passwordReset

            if(!resetSession || !resetSession.isVerified){
                return res.status(400).json({success: false, message: "Please verify OTP first"})
            }
            if(password.length < 8){
                return res.status(400).json({success: false, message: "Password must be at least 8 characters long"})
            }

            const hashedPassword = await bcrypt.hash(password, 10)

            await User.findByIdAndUpdate(resetSession.userId, {password: hashedPassword}) //update user password

            req.session.passwordReset = null

            return res.status(200).json({success: true, message: "Password reset successfully. you can now login with your new password", nextStep: "complete"})
        }

        // ---------- Invalid Step ----------
        else{
            return res.status(400).json({success: false, message: "Invalid step"})
        }

    } catch (error) {
        console.error("Forgot password error : ", error)
        res.status(500).json({success: false, message: "server error during password reset"})
        
    }
}

const resendOTPResetPassword = async (req,res) => {
    try {
        const resetSession = req.session.passwordReset

        if(!resetSession){
            return res.status(400).json({success: false, message: "No active password reset session found"})
        }

        const newOTP = generateOTP()
        const newExpiration = new Date(Date.now() + 1 * 60 * 1000)

        req.session.passwordReset.otp = {
            code: newOTP,
            expiresAt: newExpiration
        }
        req.session.passwordReset.isVerified = false

        console.log(`New password reset OTP is : ${newOTP}`)

        const user = await User.findById(resetSession.userId)
        if(!user){
            return res.status(404).json({success: false, message: "user not found"})
        }

        await sendOTPEmail(user.email, newOTP, 'password reset')

        res.status(200).json({success: true, message: "New OTP send successfully", newExpiresAt: newExpiration.toISOString()})


    } catch (error) {
        console.error("Resend OTP and reset Password error", error)
        res.status(500).json({success: false, message: "failed to resend OTP"})
    }
}

module.exports = { 
    loadSignUp,
    signUp,
    loadOtp,
    verifyOTP,
    resendOTP,
    loadSignIn,
    signIn,
    logOut,
    loadForgotPassword,
    forgotPassword,
    resendOTPResetPassword,
}

