const Brand = require("../../models/brandSchema");
const { uploadImage, deleteImage } = require("../../utils/cloudinary");
const fs = require("fs").promises;

const loadBrand = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const search = req.query.search?.trim() || "";
    const skip = (page - 1) * limit;

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    const brands = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalBrands = await Brand.countDocuments(query);
    const totalPages = Math.ceil(totalBrands / limit) || 1;

    // Check if it's an AJAX request (search)
    const isAjax = req.headers["x-requested-with"] === "XMLHttpRequest";

    if (isAjax) {
      return res.json({
        success: true,
        brands,
        currentPage: page,
        totalPages,
        totalBrands,
        limit,
      });
    }
    res.render("brand/brandManagement", {
      success: true,  
      brands: brands || [],
      currentPage: page,
      totalPages,
      totalBrands,
      limit,
      search,
    });
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
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: "Brand name is required",
        field: "brandName",
      });
    }

    // Validate file
    if (req.file) {
      const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          success: false,
          message: "Only JPEG, PNG, or GIF files are allowed",
          field: "brandLogo",
        });
      }
      if (req.file.size > 5 * 1024 * 1024) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          success: false,
          message: "Logo size must be less than 5MB",
          field: "brandLogo",
        });
      }
    }

    // Check for existing brand
    const existingBrand = await Brand.findOne({
      name: { $regex: `^${cleanBrandName}$`, $options: "i" },
    });

    if (existingBrand) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: "Brand with this name already exists",
        field: "brandName",
      });
    }

    let logoUrl = null;
    let logoPublicId = null;

    // Upload logo image using custom uploadImage function
    if (req.file) {
      try {
        const uploadResult = await uploadImage(req.file.path, {
          folder: "carezon/brands",
          transformation: [
            { width: 300, height: 300, crop: "limit" },
            { quality: "auto" },
          ],
        });

        if (uploadResult.success) {
          logoUrl = uploadResult.url;
          logoPublicId = uploadResult.public_id;
        } else {
          throw new Error(uploadResult.error);
        }

        await fs.unlink(req.file.path).catch(() => {});
      } catch (uploadError) {
        console.error("Upload error:", uploadError);
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(500).json({
          success: false,
          message: "Failed to upload logo. Please try again.",
          field: "brandLogo",
        });
      }
    }

    // Create new brand
    const brand = new Brand({
      name: cleanBrandName.toUpperCase(),
      logo: logoUrl,
      logoPublicId: logoPublicId,
      description: cleanDescription,
      isListed: isListed === "true" || isListed === true,
    });

    await brand.save();

    res.status(201).json({
      success: true,
      message: "Brand created successfully",
      brand,
    });
  } catch (error) {
    console.error("Create brand error:", error);
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({
      success: false,
      message: "Failed to create brand. Please try again.",
    });
  }
};

const updateBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const { brandName, isListed, description } = req.body;

    const cleanBrandName = brandName?.trim() || "";
    const cleanDescription = description?.trim() || "";

    // Validate brand ID
    if (!brandId) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: "Brand ID is required",
      });
    }

    // Validate required fields
    if (!cleanBrandName) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: "Brand name is required",
        field: "editBrandName",
      });
    }

    // Validate file
    if (req.file) {
      const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          success: false,
          message: "Only JPG, PNG, or GIF files are allowed",
          field: "editBrandLogo",
        });
      }
      if (req.file.size > 5 * 1024 * 1024) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          success: false,
          message: "Logo size must be less than 5MB",
          field: "editBrandLogo",
        });
      }
    }

    const brand = await Brand.findById(brandId);
    if (!brand) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const existingBrand = await Brand.findOne({
      name: { $regex: `^${cleanBrandName}$`, $options: "i" },
      _id: { $ne: brandId },
    });

    if (existingBrand) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: "Brand with this name already exists",
        field: "editBrandName",
      });
    }

    let logoUrl = brand.logo;
    let logoPublicId = brand.logoPublicId;

    // Handle logo update using custom upload/delete functions
    if (req.file) {
      try {
        // Delete old logo if exists
        if (brand.logoPublicId) {
          const deleteResult = await deleteImage(brand.logoPublicId);
          if (!deleteResult.success) {
            console.error("Error deleting old logo:", deleteResult.error);
          }
        }

        // Upload new logo
        const uploadResult = await uploadImage(req.file.path, {
          folder: "carezon/brands",
          transformation: [
            { width: 300, height: 300, crop: "limit" },
            { quality: "auto" },
          ],
        });

        if (uploadResult.success) {
          logoUrl = uploadResult.url;
          logoPublicId = uploadResult.public_id;
        } else {
          throw new Error(uploadResult.error);
        }

        await fs.unlink(req.file.path).catch(() => {});
      } catch (uploadError) {
        console.error("Upload error:", uploadError);
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(500).json({
          success: false,
          message: "Failed to upload logo. Please try again.",
          field: "editBrandLogo",
        });
      }
    }

    // Update brand fields
    brand.name = cleanBrandName.toUpperCase();
    brand.logo = logoUrl;
    brand.logoPublicId = logoPublicId;
    brand.description = cleanDescription;
    brand.isListed = isListed === "true" || isListed === true;

    await brand.save();

    res.json({
      success: true,
      message: "Brand updated successfully",
      brand,
    });
  } catch (error) {
    console.error("Update brand error:", error);
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({
      success: false,
      message: "Failed to update brand. Please try again.",
    });
  }
};

const toggleBrandStatus = async (req, res) => {
  try {
    const { brandId } = req.params;

    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: "Brand ID is required",
      });
    }

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    brand.isListed = !brand.isListed;
    await brand.save();

    res.json({
      success: true,
      message: `Brand ${brand.isListed ? "listed" : "unlisted"} successfully`,
      isListed: brand.isListed,
      brand,
    });
  } catch (error) {
    console.error("Toggle brand status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update brand status. Please try again.",
    });
  }
};

module.exports = {
  loadBrand,
  createBrand,
  updateBrand,
  toggleBrandStatus,
};