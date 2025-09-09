/**
 * Get variant attribute label based on category and variant attributes
 * @param {Map|Object} attributes - Variant attributes
 * @param {Array} distinguishingAttrs - Category-specific distinguishing attributes
 * @returns {string|null} - Variant label or null if not found
 */
function getVariantAttributeLabel(attributes, distinguishingAttrs) {
    const attrs = attributes instanceof Map ? Object.fromEntries(attributes) : (attributes || {});
    
    // Remove ingredients from attributes object
    const filteredAttrs = { ...attrs };
    delete filteredAttrs.ingredients;
    
    // First try distinguishing attributes from category (excluding ingredients)
    if (distinguishingAttrs && distinguishingAttrs.length > 0) {
        for (const attr of distinguishingAttrs) {
            if (filteredAttrs[attr] && attr !== 'ingredients') {
                return `${attr.toUpperCase()}: ${filteredAttrs[attr]}`; // Return key:value format
            }
        }
    }
    
    // Fallback: look for specific variant attributes (mg, ml, kg, size, color)
    const priorityKeys = ['mg', 'ml', 'kg', 'size', 'color'];
    for (const key of priorityKeys) {
        if (filteredAttrs[key]) {
            return `${key.toUpperCase()}: ${filteredAttrs[key]}`; // Return key:value format
        }
    }
    
    // Look for any non-ingredients attribute
    const entries = Object.entries(filteredAttrs);
    if (entries.length > 0) {
        const [key, value] = entries[0];
        return `${key.toUpperCase()}: ${value}`; // Return key:value format
    }
    
    return null;
}

/**
 * Get distinguishing attributes for a category
 * @param {string} categoryName - Category name
 * @returns {Array} - Array of distinguishing attribute keys
 */
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
    
    return categoryAttributes[categoryName.toUpperCase()] || [];
}

/**
 * Get variant label for a product variant
 * @param {Object} variant - Product variant object
 * @param {string} categoryName - Product category name
 * @returns {string|null} - Variant label or null
 */
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