const User = require("../../models/userSchema");
const bcrypt = require("bcryptjs");

const loadSignIn = async (req, res) => {
  try {
    if(req.session.isAdminAuth && req.session.admin){
        return res.redirect('/admin/dashboard')
    }
    const error = req.session.error
    req.session.error = null
    return res.render("auth/adminSignIn", {error});
  } catch (error) {
    console.log("failed to load admin signin page", error);
    res.status(500).send("failed to load signin");
  }
};

const signIn = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
        req.session.error = "please enter both email and password"
        return res.redirect('/admin/signIn')
    }
    const admin = await User.findOne({email, isAdmin: true})

    if(!admin){
        req.session.error = "Invalid emial or password"
        return res.redirect('/admin/signIn')
    }
    const isMatch = await bcrypt.compare(password, admin.password)

    if(!isMatch){
        req.session.error = "Invalid Email or Password"
        return res.redirect('/admin/signIn')
    }
    if(admin.isBlocked){
        req.session.error = "This account is blocked"
        return res.redirect('/admin/signIn')
    }
    req.session.isAdminAuth = true
    req.session.admin = {
        id: admin._id,
        email: admin.email
    }
    console.log(`Admin logged in: ${admin.email}`)
    return res.redirect('/admin/dashboard')

  } catch (error) {
    console.error("failed to signin", error);
    res.session.error = "An error occured during login. Please try again"
    return res.redirect('/admin/signIn')
  }
};

const loadDashboard = async (req, res) => {
  try {
    const admin = req.session.admin
    if(!admin){
        return res.redirect('/admin/signIn')
    }
    return res.render("dashboard/dashboard", {admin});
  } catch (error) {
    console.log("failed to load admin signin page", error);
    res.redirect('/admin/signIn')
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
  loadDashboard,
  signIn,
  logout,
};
