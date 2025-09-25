//get variant attribute label based on category and variant attributes as key: value , ex: "MG: 500" or "COLOR: Red"
function getVariantAttributeLabel(attributes, distinguishingAttrs) {
    const attrs = attributes instanceof Map ? Object.fromEntries(attributes) : (attributes || {}); 
    //remove ingredients from attributes object
    const filteredAttrs = { ...attrs };
    delete filteredAttrs.ingredients;
    
    //first try distinguishing attributes from category, excluding ingredients
    if (distinguishingAttrs && distinguishingAttrs.length > 0) {
        for (const attr of distinguishingAttrs) {
            if (filteredAttrs[attr] && attr !== 'ingredients') {
                return `${attr.toUpperCase()}: ${filteredAttrs[attr]}`; //return key:value format
            }
        }
    }
    
    //look for specific variant attributes (mg, ml, kg, size, color)
    const priorityKeys = ['mg', 'ml', 'kg', 'size', 'color'];
    for (const key of priorityKeys) {
        if (filteredAttrs[key]) {
            return `${key.toUpperCase()}: ${filteredAttrs[key]}`; //return key:value format
        }
    }
    
    //look for any non-ingredients attribute
    const entries = Object.entries(filteredAttrs);
    if (entries.length > 0) {
        const [key, value] = entries[0];
        return `${key.toUpperCase()}: ${value}`; //return key:value format
    }
    
    return null;
}


//get distinguishing attributes name for a category
function getCategoryDistinguishingAttributes(categoryName) {
    const categoryAttributes = {
        'TABLET': ['mg'],
        'CAPSULE': ['mg'], 
        'NRX TABLET': ['mg'],
        'OINTMENT': ['mg'],
        'DROPS': ['ml'],
        'SYRUP': ['ml'],
        'FOOD': ['kg'],
        'MEDICAL EQUIPMENTS': ['color'],
        'BODY SUPPORT': ['size']
    };
    
    return categoryAttributes[categoryName.toUpperCase()] || []; //return only the attribute name(mg, ml, kg...) not category with attribute name
}


//get variant label for a product variant
function getVariantLabel(variant, categoryName) {
    const distinguishingAttrs = getCategoryDistinguishingAttributes(categoryName);
    return getVariantAttributeLabel(variant.attributes, distinguishingAttrs);
}

module.exports = {
    getVariantAttributeLabel,
    getCategoryDistinguishingAttributes,
    getVariantLabel
};





// const { getVariantLabel } = require('../../utils/variantAttribute');

// use this kind method to retrieve category attributes name and value
//         if (cart && cart.items) {
//             cart.items.forEach(item => {
//                 const product = item.productId;
//                 const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
//                 if (variant && product.category) {
//                     item.variantLabel = getVariantLabel(variant, product.category.name);
//                 }
//             });
//         }