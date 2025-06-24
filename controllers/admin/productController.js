const Product = ('../../models/productSchema')

const loadProduct = async (req,res) => {
    try {
        const admin = req.session.admin
        if(!admin){
            return res.redirect('/admin/signIn')
        }
        res.render('product/productManagement')
    } catch (error) {
        console.error("load product error : ", error)

    }
}
const loadEditProduct = async (req,res) => {
    try {
        const admin = req.session.admin
        if(!admin){
            return res.redirect('/admin/signIn')
        }
        res.render('product/editProduct')
    } catch (error) {
        console.error("load product error : ", error)

    }
}
const loadAddProduct = async (req,res) => {
    try {
        const admin = req.session.admin
        if(!admin){
            return res.redirect('/admin/signIn')
        }
        res.render('product/addProduct')
    } catch (error) {
        console.error("load product error : ", error)

    }
}

module.exports = {
    loadProduct,
    loadEditProduct,
    loadAddProduct

}