const User = ('../../models/categorySchema');



const loadCategory = async (req, res) => { 
  try {
    const admin = req.session.admin;
    if (!admin) {
      return res.redirect('/admin/signIn');
    }
    return res.render("category/category", { admin }); 
  } catch (error) {
    console.error("Failed to load admin user management page:", error); 
    res.status(500).redirect('/admin/error'); // Or handle error page
  }
};

module.exports = {
    loadCategory,
}