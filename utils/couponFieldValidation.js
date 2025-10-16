//add/edit coupon fields data validations

const validateCouponData = (data) => {
    const { code, discountValue, minPurchaseValue, limit, description, startDate, expDate, status } = data;

    if (!code || !discountValue || !minPurchaseValue || !limit || !description || !startDate || !expDate || !status) {
        return {success: false, status: 400, message: "all fields are required"};
    }

    if (isNaN(discountValue) || discountValue <= 0) {
        return {success: false, status: 400, message: "discount must be a positive number"};
    }

    if (isNaN(minPurchaseValue) || minPurchaseValue < 100) {
        return {success: false, status: 400, message: "minimum purchase value must be at least 100"};
    }

    if (isNaN(limit) || limit < 1) {
        return {success: false, status: 400, message: "limit must be at least 1"};
    }

    const sDate = new Date(startDate);
    const xDate = new Date(expDate);

    if (sDate >= xDate) {
        return {success: false, status: 400, message: "expiry date must be after start date"};
    }

    const statuses = ['active', 'blocked', 'expired', 'upcoming'];
    if (!statuses.includes(status)) {
        return {success: false, status: 400, message: "invalid status field"};
    }

    const today = new Date();
    if (status === 'active') {
        if (sDate > today) {
            return {success: false, status: 400, message: "cannot set status to 'active' - start date is in the future. Use 'upcoming' status instead."};
        }
        if (xDate <= today) {
            return {success: false, status: 400, message: "cannot set status to 'active' - coupon has expired"};
        }
    }
    if (status === 'upcoming') {
        if (sDate <= today) {
            return {success: false, status: 400, message: "cannot set status to 'upcoming' - start date must be in the future"};
        }
    }

    return { success: true };
};

module.exports = {validateCouponData};