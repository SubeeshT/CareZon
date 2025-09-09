const User = require('../models/userSchema');
const mongoose = require('mongoose');

function isAdminLoggedIn(req,res,next) {
    if(req.session.isAdminAuth && req.session.admin){
        return next();
    }else{
        return res.redirect('/admin/signIn');
    }
}
//login check + user data fetching
const isUserLoggedInWithUserData = async (req, res, next) => {
    try {
        if(req.session.userId){
            const user = await User.findById(req.session.userId).select('fullName');
            res.locals.user = user;
            return next();
        } else {
            res.locals.user = null;
            return res.redirect('/signIn');
        }
    } catch (error) {
        console.error("internal error in user fetching : ", error);
        res.locals.user = null;
        return res.status(500).redirect('/signIn');
    }
}


const getUserData = async (req,res,next) => {
    try {
        if(req.session.userId){
            const user = await User.findById(req.session.userId).select('fullName');
            res.locals.user = user;
        }else{
            res.locals.user = null;
        }
        return next();
    } catch (error) {
        console.error("internal error in user fetching : ", error);
        res.locals.user = null;
        return next();
        
    }
}

const validateActiveUser = async (req,res,next) => {
    try {
        if(!req.session.userId){
            return res.status(401).redirect('/signIn');
        }

        if(!mongoose.Types.ObjectId.isValid(req.session.userId)){
            return res.status(400).redirect('/signIn');
        }

        const user = await User.findById(req.session.userId);
        if(!user){
            return res.status(404).redirect('/signIn');
        }

        if(user.isBlocked === true){
            return res.status(403).redirect('/signIn?error=blocked');
        }

        if(user.isAdmin === true){
            return res.status(403).redirect('/signIn?error=admin');
        }

        req.user = user;
        res.locals.user = user;
        return next();

    } catch (error) {
        console.error("Error in validateActiveUser middleware : ", error);
        return res.status(500).redirect('/signIn?error=server');
    }
}


module.exports = {
    isAdminLoggedIn,
    isUserLoggedInWithUserData,
    getUserData, 
    validateActiveUser 
}

