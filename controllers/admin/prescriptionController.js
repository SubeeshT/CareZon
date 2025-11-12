const { default: mongoose } = require('mongoose');
const Prescription = require('../../models/prescriptionSchema');
const User = require('../../models/userSchema');


const loadPrescriptionRequests = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const sort = req.query.sort || 'desc';
        const filter = req.query.filter?.trim() || 'All';
        const search = req.query.search?.trim() || '';
        
        await Prescription.updateMany(//update expired prescriptions
            { 
                expiryDate: { $lte: new Date() }, status: { $nin: ['Expired'] } 
            }, 
            { $set: { status: 'Expired' } }
        );
        
        let searchFilter = {};
        
        if (search) {
            const matchingUsers = await User.find({ fullName: { $regex: search, $options: 'i' } }, { _id: 1 });
            const userIds = matchingUsers.map(user => user._id);
            searchFilter.userId = { $in: userIds };
        }
        
        if (filter && filter !== 'All') {
            if (!['Pending', 'Verified', 'Rejected', 'Expired'].includes(filter)) {
                return res.status(400).json({ success: false, message: "not valid filter status" });
            }
            searchFilter.status = filter;
        }

        const prescriptionCount = await Prescription.countDocuments(searchFilter);      
     
        const prescriptions = await Prescription.find(searchFilter)
            .populate('userId', 'fullName email phone') 
            .populate('productId', 'name') 
            .populate('variantId')
            .sort({ createdAt: sort === 'desc' ? -1 : 1 })
            .skip(skip)
            .limit(limit);

        const totalPages = Math.ceil(prescriptionCount / limit);
        const pagination = {
            currentPage: page,
            totalPage: totalPages,
            limit,
            totalItems: prescriptionCount,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(200).json({success: true, pagination, prescriptions, message: 'prescription page loaded successfully'});
        }

    
        return res.status(200).render('admin/prescription/prescriptions', {prescriptions, pagination});

    } catch (error) {
        console.log("internal error while loading prescription requests: ", error);
        return res.status(500).json({success: false, message: "server error while loading prescriptions"});
    }
};

const verifyPrescription = async (req, res) => {
    try {
        const { prescriptionId, userId, status, rejectionReason } = req.body;

        if (!prescriptionId || !mongoose.Types.ObjectId.isValid(prescriptionId)) {
            return res.status(400).json({ success: false, message: "invalid prescription ID" });
        }

        const prescription = await Prescription.findById(prescriptionId);
        if (!prescription) {
            return res.status(404).json({ success: false, message: "prescription not found" });
        }

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "invalid user ID" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "user not found" });
        }

        if (!status?.trim() || !['Verified', 'Rejected'].includes(status.trim())) {
            return res.status(400).json({ success: false, message: "please select valid status" });
        }

        if (prescription.status === 'Expired') {
            return res.status(400).json({ success: false, message: "cannot change status of expired prescription" });
        }

        const newStatus = status.trim();

        if (newStatus === 'Verified') {
            if (prescription.status === 'Verified') {
                return res.status(400).json({ success: false, message: "prescription already verified" });
            }

            prescription.status = 'Verified';
            prescription.verificationDate = new Date();
            prescription.rejectionReason = null;

            await prescription.save();

            return res.status(200).json({ success: true, message: 'prescription verified successfully' });

        } else if (newStatus === 'Rejected') {
            if (prescription.status === 'Rejected') {
                return res.status(400).json({ success: false, message: "prescription already rejected" });
            }

            if (!rejectionReason?.trim()) {
                return res.status(400).json({ success: false, message: 'rejection reason is required' });
            }

            prescription.status = 'Rejected';
            prescription.rejectionReason = rejectionReason.trim();
            prescription.verificationDate = null;

            await prescription.save();

            return res.status(200).json({ success: true, message: "prescription rejected successfully" });
        }

    } catch (error) {
        console.log("internal error while changing prescription status: ", error);
        return res.status(500).json({success: false, message: "server error while changing prescription status"});
    }
};

module.exports = {
    loadPrescriptionRequests,
    verifyPrescription
};