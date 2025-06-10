const User = require('../models/userSchema')

function isUserLoggedIn (req,res,next) {
    if(req.session.userId){
        return next()
    }else{
        return res.redirect('/signIn')
    }
}

function isAdminLoggedIn(req,res,next) {
    if(req.session.isAdminAuth && req.session.admin){
        return next()
    }else{
        return res.redirect('/admin/signIn')
    }
}

module.exports = {
    isUserLoggedIn,
    isAdminLoggedIn,
}

