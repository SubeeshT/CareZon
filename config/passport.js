const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy
const User = require('../models/userSchema')
const env = require('dotenv').config()

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({googleId: profile.id})
        if(!user){
            user = await User.create({
                fullName: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                isGoogleUser: true,
                isBlocked: false
            })
        }
        return done(null, user)
    } catch (error) {
        return done(error, null)
    }
}))

passport.serializeUser((user, done) => {
    done(null, user._id) //Store user ID in session
})

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id)
        done(null, user) //user available on req.user
    } catch (error) {
        done(error, null)
    }
})

//prevent session regeneration during OAuth after admin sign in
passport.authenticate = ((originalAuthenticate) => {
    return function(strategy, options) {
        options = options || {};
        options.keepSessionInfo = true; //this prevents session regeneration
        return originalAuthenticate.call(this, strategy, options);
    };
})(passport.authenticate);

module.exports = passport