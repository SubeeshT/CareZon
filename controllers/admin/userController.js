const User = require('../../models/userSchema');

    //get user with pagination, search, and sorting
    const getUsers = async (req,res) => {
        try {
            const admin = req.session.admin;
            if(!admin){
                return res.redirect('/admin/signIn');
            }
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            //search functionality
            const search = req.query.search || req.query.q || '';
            const searchQuery = search ? {
                $and: [
                    { isAdmin: false},
                    {
                        $or: [
                            {fullName: {$regex: search, $options: 'i'}},
                            {email: {$regex: search, $options: 'i'}},
                            {phone: {$regex: search, $options: 'i'}}
                        ]
                    }
                ]
            } : {isAdmin: false};

            //sorting functionality
            const sortBy = req.query.sort || req.query.sortBy || 'created_at';
            const sortOrder = req.query.order || req.query.sortOrder || 'desc';
            const sortObj = {};

            //map frontend sort options to database field
            const sortFieldMap = {
                'name': 'fullName',
                'email': 'email',
                'mobile': 'phone',
                'date': 'createdAt',
                'created_at': 'createdAt',
                'active': 'isBlocked', 
                'blocked': 'isBlocked' 
            };

            const dbSortField = sortFieldMap[sortBy] || 'createdAt';

            //handle sorting for active/blocked users
            if(sortBy === 'active'){
                sortObj['isBlocked'] = sortOrder === 'asc' ? 1 : -1; 
            }else if(sortBy === 'blocked'){
                sortObj['isBocked'] = sortOrder === 'asc' ? -1 : 1; 
            }else{
                sortObj[dbSortField] = sortOrder === 'asc' ? 1 : -1;
            }

            //get total count for pagination
            const totalUsers = await User.countDocuments(searchQuery);
            const totalPages = Math.ceil(totalUsers / limit);

            //fetch users
            const users = await User.find(searchQuery)
                .select('fullName email phone isBlocked createdAt isVerified')
                .sort(sortObj)
                .skip(skip)
                .limit(limit);

                
        //format users data
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
            console.error("error fetching users : ",error);

            if(req.xhr || req.headers.accept.indexOf('json') > -1){
                return res.status(500).json({success: false, message: "error loading users", error: error.message});
            }
            res.status(500).render('error', {message: "error loading users", error: error.message});
        }
    }


    //block user
    const blockUser = async (req,res) => {
        try {
            const userId = req.params.id;
            const user = await User.findById(userId);

            if(!user){
                return res.status(404).json({success: false, message: "user not found"});
            }
            if(user.isAdmin) {
                return res.status(400).json({success: false, message: "cannot block admin user"});
            }
            if(user.isBlocked){
                return res.status(400).json({success: false, message: "user is already blocked"});
            }
            await User.findByIdAndUpdate(userId, {isBlocked: true});

           res.json({
                success: true,
                message: `${user.fullName} has been blocked successfully`,
                action: "blocked",
                userId: userId,
                newStatus: "blocked"
             });

        } catch (error) {
            console.error("Error blocking user : ", error)
            res.status(500).json({success: false, message: "error blocking user", error: error.message});
        }
    };

    //unblock user
    const unblockUser = async (req,res) => {
        try {
            const userId = req.params.id;
            const user = await User.findById(userId);

            if(!user){
                return res.status(404).json({success: false, message: "user not found"});
            }
            if(!user.isBlocked){
                return res.status(400).json({success: false, message: "user is not blocked"});
            }

            await User.findByIdAndUpdate(userId, {isBlocked: false});

            res.json({
                success: true,
                message: `${user.fullName} has been unblocked successfully`,
                action: "unblocked",
                userId: userId,
                newStatus: "active"
            });

        } catch (error) {
            console.error('error unblocking user', error);
            res.status(500).json({success: false, message: "error unblocking user", error: error.message});
        }
    }

    // toggle user status (combined block/unblock)
    const toggleUserStatus = async (req,res) => {
        try {
            const userId = req.params.id;
            const user = await User.findById(userId)

            if(!user){
                return res.status(404).json({success: false, message: "user not found"});
            }
            if(user.isAdmin) {
                return res.status(400).json({success: false, message: "cannot modify admin user status"});
            }

            const newStatus = !user.isBlocked;
            await User.findByIdAndUpdate(userId, {isBlocked: newStatus});

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
            console.error("error toggling user status : ",error);
            res.status(500).json({success: false, message: "error updating status", error: error.message});    
        }
    }

    //search user , ajax endpoin
    const searchUsers = async (req,res) => {
        try {
            const search = req.query.q || '';
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            
            const sortBy = req.query.sort || req.query.sortBy || 'createdAt';
            const sortOrder = req.query.order || req.query.sortOrder || 'desc';

            const searchQuery = search ? {
                $and: [
                    {isAdmin: false},
                    {
                        $or: [
                            {fullName: {$regex: search, $options: 'i'}},
                            {email: {$regex: search, $options: 'i'}},
                            {phone: {$regex: search, $options: 'i'}}
                        ]
                    }
                ]
            } : {isAdmin: false};

            const sortFieldMap = {
                'name': 'fullName',
                'email': 'email',
                'mobile': 'phone',
                'date': 'createdAt',
                'created_at': 'createdAt',
                'active': 'isBlocked',
                "blocked": 'isBlocked'
            };

            const dbSortField = sortFieldMap[sortBy] || 'createdAt';
            const sortObj = {};

            if(sortBy === 'active'){
                sortObj['isBlocked'] = sortOrder === 'asc' ? 1 : -1;
            }else if(sortBy === 'blocked'){
                sortObj['isBlocked'] = sortOrder === 'asc' ? -1 : 1;
            }else{
                sortObj[dbSortField] = sortOrder === 'asc' ? 1 : -1;
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
            console.error('error searching users: ', error);
            res.status(500).json({success: false, message: "errro searching users", error: error.message});
        }
    }

module.exports = {
    getUsers,
    blockUser,
    unblockUser,
    toggleUserStatus,
    searchUsers,
}

