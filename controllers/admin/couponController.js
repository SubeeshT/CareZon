const Coupon = require('../../models/couponSchema');
const { default: mongoose } = require('mongoose');
const {validateCouponData}= require("../../utils/couponFieldValidation");

const loadCoupons = async (req,res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search?.trim() || '';
        const sort = req.query.sort || 'desc';
        const filter = req.query.filter || 'all'

        await Coupon.updateMany({expDate: {$lte: new Date()}, status: {$ne: 'expired'}}, {$set: {status : 'expired'}});
        await Coupon.updateMany({status: {$eq: 'upcoming'}, startDate: {$lte: new Date()}}, {$set: {status: 'active'}});

        const searchFilter = {};
        if(search){
            searchFilter.code = {$regex: search, $options: 'i'}
        }

        if(filter !== 'all'){
            const include = ['active', 'blocked', 'expired', 'upcoming'];
            if(include.includes(filter)){
                searchFilter.status = filter;
            }else{
                return res.status(400).json({success: false, message: "not a valid filter"});
            }
        }

        const coupons = await Coupon.find(searchFilter).sort({createdAt: sort === 'desc' ? -1 : 1}).skip(skip).limit(limit);
        if(!coupons){
            return res.status(404).json({success: false, coupons: [], message: "coupons not found"});
        }

        const totalCoupons = await Coupon.countDocuments(searchFilter);
        const pagination = {
            totalPages: Math.ceil(totalCoupons / limit),
            currentPage: page,
            totalItems: totalCoupons,
            limit,
            skip,
            hasNextPage: Math.ceil(totalCoupons / limit) > page,
            hasPrevPage: page > 1 
        }

        if(req.headers.accept.includes('application/json')){
            return res.status(200).json({success: true, coupons, pagination});
        }

        return res.status(200).render('admin/coupon/coupons', {coupons, pagination});

    } catch (error) {
        console.error("internal error get while loading coupon : ", error);
        return res.status(500).json({success: false, message: "internal error get while loading coupon"});
    }
}

const addCoupon = async (req, res) => {
    try {
        const { code, discountValue, minPurchaseValue, limit, description, startDate, expDate, status } = req.body;
        
        //validation for fields from validateCouponData helper function
        const validation = validateCouponData(req.body);
        if (!validation.success) {
            return res.status(validation.status).json(validation);
        }

        //check existing coupon code or not
        const existingCode = await Coupon.findOne({code: { $regex: `^${code.trim()}$`, $options: 'i' }});
        if (existingCode) {
            return res.status(409).json({success: false, message: "coupon code already exists"});
        }

        const newCoupon = new Coupon({
            code: code.trim(),
            discountValue: Number(discountValue),
            minPurchaseValue: Number(minPurchaseValue),
            limit: Number(limit),
            description: description.trim(),
            startDate: new Date(startDate),
            expDate: new Date(expDate),
            status: status.trim()
        });
        await newCoupon.save();

        return res.status(201).json({success: true, message: "coupon added successfully"});

    } catch (error) {
        console.error("Error adding coupon:", error);
        return res.status(500).json({success: false, message: "internal server error"});
    }
}

const editCoupon = async (req, res) => {
    try {
        const { id } = req.params; 
        const { code, discountValue, minPurchaseValue, limit, description, startDate, expDate, status } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({success: false, message: "invalid coupon ID"});
        }

        const validation = validateCouponData(req.body);//for field validations, calling helper function
        if (!validation.success) {
            return res.status(validation?.status).json({success: validation?.success, message: validation?.message});
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({success: false, message: "coupon not found"});
        }

        const existingCode = await Coupon.findOne({code: { $regex: `^${code.trim()}$`, $options: 'i' }, _id: { $ne: id }});
        if (existingCode) {
            return res.status(409).json({success: false, message: "coupon code already exists"});
        }

        coupon.code = code.trim();
        coupon.discountValue = Number(discountValue);
        coupon.minPurchaseValue = Number(minPurchaseValue);
        coupon.limit = Number(limit);
        coupon.description = description.trim();
        coupon.startDate = new Date(startDate);
        coupon.expDate = new Date(expDate);
        coupon.status = status.trim();

        await coupon.save();

        return res.status(200).json({success: true, message: "Coupon updated successfully"});

    } catch (error) {
        console.error("Error editing coupon:", error);
        return res.status(500).json({success: false, message: "Internal server error"});
    }
};

const changeStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({success: false, message: "invalid coupon ID"});
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({success: false, message: "coupons are not found"});
        }

        const statuses = ['active', 'blocked', 'upcoming'];
        if (!statuses.includes(status)) {
            return res.status(400).json({success: false, message: "invalid status field"});
        }

        const today = new Date();
        const startDate = new Date(coupon.startDate);
        const expDate = new Date(coupon.expDate);
        if (status === 'active') {
            if (startDate > today) {
                return res.status(400).json({success: false, message: "cannot set status to 'active' - start date is in the future. Use 'upcoming' status instead."});
            }
            if (expDate <= today) {
                return res.status(400).json({success: false, message: "cannot set status to 'active' - coupon has expired"});
            }
        }
        if (status === 'upcoming') {
            if (startDate <= today) {
                return res.status(400).json({success: false, message: "cannot set status to 'upcoming' - start date must be in the future"});
            }
        }

        coupon.status = status;
        await coupon.save();

        return res.status(200).json({success: true, message: "status updated successfully"});
    } catch (error) {
        console.error("Error changing status:", error);
        return res.status(500).json({success: false, message: "internal server error"});
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({success: false, message: "invalid coupon ID"});
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({success: false, message: "coupon not found"});
        }

        //check if coupon has been used
        if (coupon.usedBy && coupon.usedBy.length > 0) {
            return res.status(400).json({success: false, message: "cannot delete coupon that has been used by customers"});
        }

        await Coupon.findByIdAndDelete(id);

        return res.status(200).json({success: true, message: "coupon deleted successfully"});
    } catch (error) {
        console.error("Error deleting coupon:", error);
        return res.status(500).json({success: false, message: "internal server error"});
    }
};

module.exports = {
    loadCoupons,
    addCoupon,
    editCoupon,
    changeStatus,
    deleteCoupon
}
