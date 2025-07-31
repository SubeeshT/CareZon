const User = require('../../models/userSchema');

// Get users with pagination, search, sorting, and filtering
const getUsers = async (req, res) => {
    try {
        const admin = req.session.admin;
        if (!admin) {
            return res.redirect('/admin/signIn');
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        // Search functionality
        const search = req.query.search || req.query.q || '';
        let searchQuery = { isAdmin: false };

        if (search) {
            const dateRegex = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
            const isDateSearch = dateRegex.test(search);
            
            if (isDateSearch) {
                const dateParts = search.split(/[\/\-]/);
                let searchDate;
                
                if (dateParts.length === 3) {
                    const formats = [
                        `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`,
                        `${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}-${dateParts[2]}`,
                        `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`
                    ];
                    
                    for (const format of formats) {
                        const testDate = new Date(format);
                        if (!isNaN(testDate.getTime())) {
                            searchDate = testDate;
                            break;
                        }
                    }
                }
                
                if (searchDate) {
                    const startOfDay = new Date(searchDate);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(searchDate);
                    endOfDay.setHours(23, 59, 59, 999);
                    
                    searchQuery = {
                        $and: [
                            { isAdmin: false },
                            {
                                createdAt: {
                                    $gte: startOfDay,
                                    $lte: endOfDay
                                }
                            }
                        ]
                    };
                }
            } else {
                searchQuery = {
                    $and: [
                        { isAdmin: false },
                        {
                            $or: [
                                { fullName: { $regex: search, $options: 'i' } },
                                { email: { $regex: search, $options: 'i' } },
                                { phone: { $regex: search, $options: 'i' } }
                            ]
                        }
                    ]
                };
            }
        }

        // Filtering for active/blocked users
        const filter = req.query.filter;
        if (filter === 'active') {
            searchQuery.isBlocked = false;
        } else if (filter === 'blocked') {
            searchQuery.isBlocked = true;
        }

        // Sorting functionality
        const sortBy = req.query.sort || 'createdAt';
        const sortOrder = req.query.order || 'desc';
        const sortObj = {};

        const sortFieldMap = {
            fullName: 'fullName',
            email: 'email',
            phone: 'phone',
            createdAt: 'createdAt'
        };

        const dbSortField = sortFieldMap[sortBy] || 'createdAt';
        if (filter !== 'active' && filter !== 'blocked') {
            sortObj[dbSortField] = sortOrder === 'asc' ? 1 : -1;
        } else {
            sortObj.createdAt = sortOrder === 'asc' ? 1 : -1; // Default sort by createdAt for filtered views
        }

        // Get total count for pagination
        const totalUsers = await User.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalUsers / limit);

        // Fetch users
        const users = await User.find(searchQuery)
            .select('fullName email phone isBlocked createdAt isVerified')
            .sort(sortObj)
            .skip(skip)
            .limit(limit);

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
                sortOrder
            });
        }

        // Render the page for initial load
        res.render('users/userManagement', {
            admin,
            users: formattedUsers,
            currentPage: page,
            totalPages,
            totalUsers,
            limit,
            search,
            sortBy,
            sortOrder,
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

// Search users endpoint
const searchUsers = async (req, res) => {
    try {
        const search = req.query.q || req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const sortBy = req.query.sort || 'createdAt';
        const sortOrder = req.query.order || 'desc';
        const filter = req.query.filter;

        let searchQuery = { isAdmin: false };

        if (search) {
            const dateRegex = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
            const isDateSearch = dateRegex.test(search);
            
            if (isDateSearch) {
                const dateParts = search.split(/[\/\-]/);
                let searchDate;
                
                if (dateParts.length === 3) {
                    const formats = [
                        `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`,
                        `${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}-${dateParts[2]}`,
                        `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`
                    ];
                    
                    for (const format of formats) {
                        const testDate = new Date(format);
                        if (!isNaN(testDate.getTime())) {
                            searchDate = testDate;
                            break;
                        }
                    }
                }
                
                if (searchDate) {
                    const startOfDay = new Date(searchDate);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(searchDate);
                    endOfDay.setHours(23, 59, 59, 999);
                    
                    searchQuery = {
                        $and: [
                            { isAdmin: false },
                            {
                                createdAt: {
                                    $gte: startOfDay,
                                    $lte: endOfDay
                                }
                            }
                        ]
                    };
                }
            } else {
                searchQuery = {
                    $and: [
                        { isAdmin: false },
                        {
                            $or: [
                                { fullName: { $regex: search, $options: 'i' } },
                                { email: { $regex: search, $options: 'i' } },
                                { phone: { $regex: search, $options: 'i' } }
                            ]
                        }
                    ]
                };
            }
        }

        // Filtering for active/blocked users
        if (filter === 'active') {
            searchQuery.isBlocked = false;
        } else if (filter === 'blocked') {
            searchQuery.isBlocked = true;
        }

        const sortFieldMap = {
            fullName: 'fullName',
            email: 'email',
            phone: 'phone',
            createdAt: 'createdAt'
        };

        const dbSortField = sortFieldMap[sortBy] || 'createdAt';
        const sortObj = {};
        if (filter !== 'active' && filter !== 'blocked') {
            sortObj[dbSortField] = sortOrder === 'asc' ? 1 : -1;
        } else {
            sortObj.createdAt = sortOrder === 'asc' ? 1 : -1;
        }

        const totalUsers = await User.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalUsers / limit);

        const users = await User.find(searchQuery)
            .select('fullName email phone isBlocked createdAt isVerified')
            .sort(sortObj)
            .skip(skip)
            .limit(limit);

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

        res.json({
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
            sortOrder
        });

    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({
            success: false,
            message: "Error searching users",
            error: error.message
        });
    }
};

// Search suggestions endpoint
const getSearchSuggestions = async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query || query.length < 2) {
            return res.json({ success: true, suggestions: [] });
        }

        const suggestions = await User.aggregate([
            { $match: { isAdmin: false } },
            {
                $project: {
                    suggestions: [
                        "$fullName",
                        "$email",
                        "$phone"
                    ]
                }
            },
            { $unwind: "$suggestions" },
            {
                $match: {
                    suggestions: {
                        $regex: query,
                        $options: 'i'
                    }
                }
            },
            {
                $group: {
                    _id: "$suggestions"
                }
            },
            { $limit: 10 },
            { $sort: { _id: 1 } }
        ]);

        const suggestionList = suggestions.map(item => item._id).filter(Boolean);

        res.json({
            success: true,
            suggestions: suggestionList
        });

    } catch (error) {
        console.error('Error getting search suggestions:', error);
        res.status(500).json({
            success: false,
            message: "Error getting suggestions",
            error: error.message
        });
    }
};

// Block user
const blockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (user.isAdmin) {
            return res.status(400).json({ success: false, message: "Cannot block admin user" });
        }
        if (user.isBlocked) {
            return res.status(400).json({ success: false, message: "User is already blocked" });
        }
        await User.findByIdAndUpdate(userId, { isBlocked: true });

        res.json({
            success: true,
            message: `${user.fullName} has been blocked successfully`,
            action: "blocked",
            userId: userId,
            newStatus: "blocked"
        });

    } catch (error) {
        console.error("Error blocking user: ", error);
        res.status(500).json({ success: false, message: "Error blocking user", error: error.message });
    }
};

// Unblock user
const unblockUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (!user.isBlocked) {
            return res.status(400).json({ success: false, message: "User is not blocked" });
        }

        await User.findByIdAndUpdate(userId, { isBlocked: false });

        res.json({
            success: true,
            message: `${user.fullName} has been unblocked successfully`,
            action: "unblocked",
            userId: userId,
            newStatus: "active"
        });

    } catch (error) {
        console.error('Error unblocking user:', error);
        res.status(500).json({ success: false, message: "Error unblocking user", error: error.message });
    }
};

// Toggle user status (combined block/unblock)
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
    searchUsers,
    getSearchSuggestions,
    blockUser,
    unblockUser,
    toggleUserStatus,
};