const User = require('../../models/userSchema');

// Get users with pagination, search, sorting, and filtering
const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const search = req.query.search || '';
        let searchQuery = { isAdmin: false };

        if (search) {
            searchQuery = {
                $and: [
                    { isAdmin: false },
                    { fullName: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Filtering for active/blocked users
        const filter = req.query.filter;
        if (filter === 'active') {
            searchQuery.isBlocked = false;
        } else if (filter === 'blocked') {
            searchQuery.isBlocked = true;
        }

        // Sorting functionality with case-insensitive collation
        const sortBy = req.query.sort || 'createdAt';
        const sortOrder = req.query.order || 'desc';
        const sortObj = {};

        const sortFieldMap = {
            fullName: 'fullName',
            createdAt: 'createdAt'
        };

        const dbSortField = sortFieldMap[sortBy] || 'createdAt';
        sortObj[dbSortField] = sortOrder === 'asc' ? 1 : -1;

        const totalUsers = await User.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalUsers / limit);

        let query = User.find(searchQuery)
            .select('fullName email phone isBlocked createdAt isVerified')
            .sort(sortObj)
            .skip(skip)
            .limit(limit);

        // Apply collation for case-insensitive sorting (especially for fullName)
        if (dbSortField === 'fullName') {
            query = query.collation({ 
                locale: 'en', 
                strength: 2 
            });
        }

        const users = await query;

        // Format users data
        const formattedUsers = users.map((user, index) => ({
            _id: user._id,
            serialNo: skip + index + 1,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone || 'N/A',
            isBlocked: user.isBlocked,
            createdAt: user.createdAt,
            isVerified: user.isVerified,
            status: user.isBlocked ? 'blocked' : 'active'
        }));

        // Check if this is an AJAX request
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                success: true,
                users: formattedUsers,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalUsers,
                    limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                    nextPage: page < totalPages ? page + 1 : null,
                    prevPage: page > 1 ? page - 1 : null,
                    showingStart: skip + 1,
                    showingEnd: Math.min(skip + limit, totalUsers)
                },
                search,
                sortBy,
                sortOrder,
                filter
            });
        }

        res.render('users/userManagement', {
            users: formattedUsers,
            currentPage: page,
            totalPages,
            totalUsers,
            limit,
            search,
            sortBy,
            sortOrder,
            filter,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null,
            showingStart: skip + 1,
            showingEnd: Math.min(skip + limit, totalUsers)
        });

    } catch (error) {
        console.error("Error fetching users: ", error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ success: false, message: "Error loading users", error: error.message });
        }
        res.status(500).render('error', { message: "Error loading users", error: error.message });
    }
};

//Toggle user status block/unblock 
const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: "Cannot modify admin user status" });
        }

        const newStatus = !user.isBlocked;
        await User.findByIdAndUpdate(userId, { isBlocked: newStatus });

        const action = newStatus ? "blocked" : "unblocked";
        const statusText = newStatus ? "blocked" : "active";

        res.json({
            success: true,
            message: `${user.fullName} has been ${action} successfully`,
            action: action,
            userId: userId,
            newStatus: statusText
        });

    } catch (error) {
        console.error("Error toggling user status: ", error);
        res.status(500).json({ success: false, message: "Error updating status", error: error.message });
    }
};

module.exports = {
    getUsers,
    toggleUserStatus
};