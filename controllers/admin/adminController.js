const User = require("../../models/userSchema");
const bcrypt = require("bcryptjs");

const loadSignIn = async (req, res) => {
  try {
    return res.render("auth/adminSignIn");
  } catch (error) {
    console.log("failed to load admin signin page", error);
    res.status(500).json({success: false, message: "failed to load sign in page"});
  }
};

const signIn = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
        return res.status(400).json({success: false, message: "please enter both email and password"});
    }
    const admin = await User.findOne({email, isAdmin: true});

    if(!admin){
        return res.status(401).json({success: false, message: "invalid email, your not an Admin"});
    }
    const isMatch = await bcrypt.compare(password, admin.password)

    if(!isMatch){
        return res.status(401).json({success: false, message: "invalid Email or Password"});
    }
    if(admin.isBlocked){
        return res.status(403).json({success: false, message: "this account was blocked"});
    }
    req.session.isAdminAuth = true
    req.session.admin = {
        id: admin._id,
        email: admin.email
    }
    console.log(`Admin logged in: ${admin.email}`)

    return res.status(200).json({success: true, message: "Admin login successful", redirectUrl: '/admin/dashboard'})

  } catch (error) {
    console.error("failed to signin", error);
    return res.status(500).json({success: false, message: "an error occurred during the login. please try again"});
  }
};

const loadDashboard = async (req, res) => {
  try {
    return res.render("dashboard/dashboard");
  } catch (error) {
    console.log("failed to load admin signin page", error);
    return res.redirect('/admin/signIn')
  }
};

const logout = (req,res) => {
    req.session.destroy((err) => {
        if(err){
            console.error("error during logOut", err)
            return res.status(500).send('Logout failed')
        }
        res.clearCookie('connect.sid')
        return res.redirect("/admin/signIn")
    })
}

module.exports = {
  loadSignIn,
  signIn,
  loadDashboard,
  logout,
};
