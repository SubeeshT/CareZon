const User = require('../models/userSchema');

function isUserLoggedIn (req,res,next) {
    if(req.session.userId){
        return next();
    }else{
        return res.redirect('/signIn');
    }
}

function isAdminLoggedIn(req,res,next) {
    if(req.session.isAdminAuth && req.session.admin){
        return next();
    }else{
        return res.redirect('/admin/signIn');
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

module.exports = {
    isUserLoggedIn,
    isAdminLoggedIn,
    getUserData 

}

