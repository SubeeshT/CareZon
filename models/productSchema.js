const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  quantity: {//use while adding stock
    type: Number,
    required: true,
    min: 0
  },
   stock: {//total stock
    type: Number,
    required: false,
    min: 0,
    default: 0
  },
  regularPrice: {
    type: Number,
    required: true,
    min: 0
  },
  salesPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  manufacturingDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date
  },
  isListed: { 
    type: Boolean,
    default: true
  },
  prescriptionRequired: {
    type: Boolean,
    default: false
  },
  discountStatus: {
    type: Boolean,
    default: false
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0,
    max: 80
  },
  uom: {//ex: one strip of tablet have 10 units
    type: Number,
    required: true
  },
  attributes: { //kg, mg, ml , color, material, ingredients,
    type: Map,
    of: String,
    default: {}
  },
   ingredients: { 
    type: [String], 
    required: false, 
    index: true 
  },
  images: [
    {
      public_id: {
        type: String,
        required: true
      },
      url: {
        type: String,
        required: true
      },
      altText: String
    }
  ],
 
}, { timestamps: true });


const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  variants: [variantSchema]
}, { timestamps: true });

//indexing for search
productSchema.index({ 
  name: 'text', 
  description: 'text',
  'variants.ingredients': 'text'
});
productSchema.index({ brand: 1, category: 1 });


module.exports = mongoose.model('Product', productSchema);