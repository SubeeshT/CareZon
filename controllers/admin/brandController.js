const Brand = require("../../models/brandSchema");
const { deleteImage } = require("../../utils/cloudinary");

const loadBrand = async (req, res) => {
  try {
    
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search?.trim() || "";
    const skip = (page - 1) * limit;

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    const brands = await Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

    const totalBrands = await Brand.countDocuments(query);
    const totalPages = Math.ceil(totalBrands / limit) || 1;

    //check if it's an AJAX request (search)
    const isAjax = req.headers["x-requested-with"] === "XMLHttpRequest";
    if (isAjax) {
      return res.json({success: true, brands, currentPage: page, totalPages, totalBrands, limit,});
    }

    res.render("brand/brandManagement", {success: true, brands: brands || [], currentPage: page, totalPages, totalBrands, limit, search,});

  } catch (error) {
    console.error("Load brands error:", error);
    res.status(500).render("error", { message: "Failed to load brands" });
  }
};

const createBrand = async (req, res) => {
  try {
    const { brandName, isListed, description } = req.body;

    const cleanBrandName = brandName?.trim() || "";
    const cleanDescription = description?.trim() || "";

    if (!cleanBrandName) {
      return res.status(400).json({success: false, message: "Brand name is required", field: "brandName",});
    }

    const existingBrand = await Brand.findOne({name: { $regex: `^${cleanBrandName}$`, $options: "i" },});

    if (existingBrand) {
      return res.status(400).json({success: false, message: "Brand with this name already exists", field: "brandName",});
    }

    let logoUrl = null;
    let logoPublicId = null;

    //handle logo - already uploaded to Cloudinary via multer middleware, this req.file.path and req.file.filename, It’s built by Multer + Cloudinary storage engine working together.
    if (req.file) {
      logoUrl = req.file.path; //Cloudinary url
      logoPublicId = req.file.filename; //Cloudinary public_id
    }

    const brand = new Brand({
      name: cleanBrandName.toUpperCase(),
      logo: logoUrl,
      logoPublicId: logoPublicId,
      description: cleanDescription,
      isListed: isListed === "true" || isListed === true,
    });

    await brand.save();

    res.status(201).json({success: true, message: "Brand created successfully", brand,});

  } catch (error) {
    console.error("Create brand error:", error);

    if (req.file && req.file.filename) {
      await deleteImage(req.file.filename).catch(err => console.error('image file cleanup failed', err));
    }

    return res.status(500).json({success: false, message: "Failed to create brand. Please try again.",});
  }
};

const updateBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const { brandName, isListed, description } = req.body;

    const cleanBrandName = brandName?.trim() || "";
    const cleanDescription = description?.trim() || "";

    //validate brand ID
    if (!brandId) {
      return res.status(400).json({success: false, message: "Brand ID is required",});
    }

    // Validate required fields
    if (!cleanBrandName) {
      return res.status(400).json({success: false, message: "Brand name is required", field: "editBrandName",});
    }

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({success: false, message: "Brand not found",});
    }

    const existingBrand = await Brand.findOne({name: { $regex: `^${cleanBrandName}$`, $options: "i" }, _id: { $ne: brandId },});

    if (existingBrand) {
      return res.status(400).json({success: false, message: "Brand with this name already exists", field: "editBrandName",});
    }

    let logoUrl = brand.logo;
    let logoPublicId = brand.logoPublicId;

    if (req.file) {
      //delete old logo if exists
      if (brand.logoPublicId) {
        try {
          const deleteResult = await deleteImage(brand.logoPublicId);
          if (!deleteResult.success) {
            console.error("Error deleting old logo:", deleteResult.error);
          }
        } catch (deleteError) {
          console.error("Delete error:", deleteError);
        }
      }
      logoUrl = req.file.path;//new cloudinary secure_url
      logoPublicId = req.file.filename; //new cloudinary public_id
    }

    brand.name = cleanBrandName.toUpperCase();
    brand.logo = logoUrl;
    brand.logoPublicId = logoPublicId;
    brand.description = cleanDescription;
    brand.isListed = isListed === "true" || isListed === true;

    await brand.save();

    res.json({success: true, message: "Brand updated successfully", brand,});

  } catch (error) {
    console.error("Update brand error:", error);

    if (req.file && req.file.filename) {
      await deleteImage(req.file.filename).catch(err => console.error('cleanup failed', err));
    }

    return res.status(500).json({success: false, message: "Failed to update brand. Please try again.",});
  }
};

const toggleBrandStatus = async (req, res) => {
  try {
    const { brandId } = req.params;

    if (!brandId) {
      return res.status(400).json({success: false, message: "Brand ID is required",});
    }

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({success: false, message: "Brand not found",});
    }

    brand.isListed = !brand.isListed;

    await brand.save();

    return res.json({success: true, message: `Brand ${brand.isListed ? "listed" : "unlisted"} successfully`, isListed: brand.isListed, brand,});

  } catch (error) {
    console.error("Toggle brand status error:", error);
    return res.status(500).json({success: false, message: "Failed to update brand status. Please try again.",});
  }
};

module.exports = {
  loadBrand,
  createBrand,
  updateBrand,
  toggleBrandStatus,
};