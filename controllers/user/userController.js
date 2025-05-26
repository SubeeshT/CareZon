const session = require('express-session')
const User = require('../../models/userSchema')
const bcrypt = require('bcryptjs')
const sendOTPEmail = (require('../../utils/sendEmail'))

const pageNotFound = async (req,res) => {
    try {
        res.render('page-404')
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

const loadLanding = async (req,res) => {
    try {
        return res.render('userHome')
    } catch (error) {
        console.log("home page not found",error)
        res.status(500).send("failed to found home page")
    }
} 

const loadSignUp = async (req,res) => {
    try {
        return res.render('userSignUp')
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
            return res.status(400).json({message : "Passwords do not match"})
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

        res.render('userOTP', {
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
        return res.render('userOTP')
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

        // Convert expiresAt to Date object if it's a string
        const expiresAt = new Date(tempUser.otp.expiresAt);

        // Check if OTP has expired first
        if(expiresAt < new Date()){
           return res.render('userOTP', {
            otpExpiresAt: expiresAt.toISOString(),
            error: "OTP has expired. Please request a new one."
           })
        }

        // Check OTP match
        if(!otp || tempUser.otp.code !== otp){
            return res.render('userOTP', {
                otpExpiresAt: expiresAt.toISOString(),
                error: "Invalid OTP. Please try again."
            })
        }

        const newUser = new User({
            fullName: tempUser.fullName,
            email: tempUser.email,
            phone: tempUser.phone,
            password: tempUser.password,
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
                message: "No active session found. Please restart the registration processs.",
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

        //req.session.tempUser = tempUser
        
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
        return res.render('userSignIn')
    } catch (error) {
        console.log("failed to load user signin page", error)
        res.status(500).send("failed to load signin")
    }
}

const signIn = async (req,res) => {
    try {
        const {emailOrPhone, password} = req.body

        const user = await User.findOne({
            $or: [{email: emailOrPhone}, {phone: emailOrPhone}]
        })

        if(!user){
            return res.status(401).json({message: "Not have an account, Please signUP first"})
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password)
        if(!isPasswordMatch){
            return res.status(401).json({message: "Email & Password is not matching"})
        }

        if(user.isBlocked){
            return res.status(403).json({message: "This account is blocked, please contact us."})
        }

        req.session.userId = user._id 
        console.log(`Loged user is : ${user.fullName}`)

        res.redirect('/home')

    } catch (error) {
        console.error("failed to signIn : ", error)
        res.status(500).json({message: "failed to signIn, Please try agian"})
    }
}

const loadHome  = (req,res) => {
    const user = req.session.userId
    res.render('userHome', {user})             
}

const logOut = (req,res) => {
    req.session.destroy((err) => {
        if(err){
            console.error("Failed to logout : ",err)
            return res.status(500).send("failed to log out, Please try again")
        }
        res.clearCookie('connect.sid')
        res.redirect('/')
    })
}

module.exports = {
    pageNotFound,
    loadLanding,
    loadSignUp,
    signUp,
    loadOtp,
    verifyOTP,
    resendOTP,
    loadSignIn,
    signIn,
    loadHome,
    logOut,
}

