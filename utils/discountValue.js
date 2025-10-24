//this only find which one discount is apply(category/product)
const calculateEffectiveDiscount = (productDiscount, productDiscountStatus, categoryDiscount, categoryDiscountStatus) => {
    let effectiveDiscount = 0;
    let appliedDiscountType = 'none';
    
    //only consider active discounts
    const activeProductDiscount = productDiscountStatus ? productDiscount : 0;
    const activeCategoryDiscount = categoryDiscountStatus ? categoryDiscount : 0;
    
    //apply the greater discount
    if (activeProductDiscount >= activeCategoryDiscount) {
        effectiveDiscount = activeProductDiscount;
        appliedDiscountType = activeProductDiscount > 0 ? 'product' : 'none';
    } else {
        effectiveDiscount = activeCategoryDiscount;
        appliedDiscountType = 'category';
    }
    
    return {
        effectiveDiscount,
        appliedDiscountType,
        productDiscount: activeProductDiscount,
        categoryDiscount: activeCategoryDiscount
    };
};

//this only calculate the discount sales price with the greater discount % value
const calculateDiscountedPrice = (regularPrice, productDiscount, productDiscountStatus, categoryDiscount, categoryDiscountStatus) => {
    const { effectiveDiscount } = calculateEffectiveDiscount(
        productDiscount, 
        productDiscountStatus, 
        categoryDiscount, 
        categoryDiscountStatus
    );
    
    const discountAmount = (regularPrice * effectiveDiscount) / 100;
    return Math.round(regularPrice - discountAmount);
};

module.exports = {
    calculateEffectiveDiscount,
    calculateDiscountedPrice
};