const Category = require('../../models/categorySchema');

const getCategories = async (req, res) => {
  try {
    const admin = req.session.admin;
    if (!admin) {
      return res.redirect('/admin/signIn');
    }

    const { search = "", page = 1, limit = 8 } = req.query; 
    const skip = (page - 1) * limit;

    let query = {};
    if (search.trim()) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          //{ description: { $regex: search, $options: 'i' } },
        ]
      };
    }

    const totalCategories = await Category.countDocuments(query);
    const categories = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // If it's an AJAX request, return JSON
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({
        success: true,
        categories,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCategories / limit),
          totalRecords: totalCategories,
          limit: parseInt(limit)
        }
      });
    }

    res.render('category/categoryManagement', {
      admin,
      categories,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCategories / limit),
        totalRecords: totalCategories,
        limit: parseInt(limit)
      },
      search
    });
  } catch (error) {
    console.error("Get categories error: ", error);
    res.status(500).json({ success: false, message: "Error fetching categories" });
  }
};

const addCategory = async (req, res) => {
  try {
    const { name, description, status, discount } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({ success: false, message: "Category already exists" });
    }

    const newCategory = new Category({
      name: name.trim().toUpperCase(),
      description: description ? description.trim() : '',
      isListed: status === 'active',
      Discounts: parseInt(discount) || 0,
      DiscountStatus: parseInt(discount) > 0
    });

    await newCategory.save();
    res.json({ success: true, message: "Category added successfully", category: newCategory });
  } catch (error) {
    console.error("Add category error: ", error);
    res.status(500).json({ success: false, message: "Error adding category" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { name, description, status, discount } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: categoryId } 
    });

    if (existingCategory) {
      return res.status(400).json({ success: false, message: "Category name already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      categoryId,
      {
        name: name.trim().toUpperCase(),
        description: description ? description.trim() : '',
        isListed: status === 'active',
        Discounts: parseInt(discount) || 0,
        DiscountStatus: parseInt(discount) > 0
      },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    res.json({ success: true, message: "Category updated successfully", category: updatedCategory });
  } catch (error) {
    console.error("Update category error: ", error);
    res.status(500).json({ success: false, message: "Error updating category" });
  }
};

const toggleCategoryStatus = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { status } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    category.isListed = status === 'active';
    await category.save();

    res.json({
      success: true,
      message: `Category ${status === 'active' ? 'activated' : 'blocked'} successfully`,
      category
    });
  } catch (error) {
    console.error("Toggle category status error: ", error);
    res.status(500).json({ success: false, message: "Error changing category status" });
  }
};

const toggleDiscountStatus = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { DiscountStatus } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    category.DiscountStatus = DiscountStatus;
    await category.save();

    res.json({ 
      success: true,
      message: `Offer ${DiscountStatus ? 'activated' : 'deactivated'} successfully`,
      category
    });

  } catch (error) {
    console.error("Toggle offer error: ", error);
    res.status(500).json({ success: false, message: "Error changing offer status" });
  }
};

module.exports = {
  getCategories,
  addCategory,
  updateCategory,
  toggleCategoryStatus,
  toggleDiscountStatus,
  
};