const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const {sendContactEmail} = require('../../utils/sendEmail');


const loadAbout = async (req,res) => {
    try {
        const userCount = await User.countDocuments();
        const orderCount = await Order.countDocuments({orderStatus: {$nin: ['pending', 'returned', 'cancelled']}});
        const productsCount = await Product.countDocuments()

        return res.status(200).render('user/aboutAndContact/about', {success: true, userCount, orderCount, productsCount});
    } catch (error) {
        console.log("get error while loading about page : ", error);
        return res.status(500).json({success: false, message: "internal error while loading about page"});
    }
}

const loadContact = async (req,res) => {
    try {
        return res.status(200).render('user/aboutAndContact/contact');
    } catch (error) {
        console.log("internal error while loading contact : ", error);
        return res.status(500).json({success: false, message: "internal error while loading contact"});
    }
}

const submitContact = async (req, res) => {
    try {
        const {firstName, lastName, email, phone, subject, message, newsletter} = req.body;

        if (!firstName || !lastName || !email || !phone || !subject || !message) {
            return res.status(400).json({ success: false, message: "all fields are required" });
        }

        await sendContactEmail({firstName, lastName, email, phone, subject, message, newsletter: newsletter || false});

        return res.status(200).json({success: true, message: "Thank you for contacting CareZon! We have received your message and will respond within 24 hours."});
    } catch (error) {
        console.log("error while submitting contact form: ", error);
        return res.status(500).json({ success: false, message: "failed to send message. please try again later." });
    }
}

module.exports = {
    loadAbout,
    loadContact,
    submitContact,
}
