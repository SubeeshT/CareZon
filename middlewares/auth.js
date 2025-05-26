const User = require('../models/userSchema')

function isUserLoggedIn (req,res,next) {
    if(req.session.userId){
        return next()
    }else{
        return res.redirect('/signIn')
    }
}

module.exports = {
    isUserLoggedIn,
}