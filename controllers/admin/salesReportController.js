const Order = require('../../models/orderSchema');


const getSalesReportData = async (req,res) => {
    try {
        const {reportType = 'daily', startDate, endDate, page = 1, limit = 10} = req.query;

        let dateFilter = {};
        const now = new Date();
        
        if (reportType === 'custom') {
            if (!startDate || !endDate) {
                return res.status(400).json({success: false, message: 'start date and end date are required for custom date range'});
            }
            
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            if (start > end) {
                return res.status(400).json({success: false, message: 'start date cannot be after end date'});
            }
            
            dateFilter = {
                $or: [
                    { deliveredAt: { $gte: start, $lte: end } },
                    { 
                        paymentStatus: 'completed', createdAt: { $gte: start, $lte: end }
                    }
                ]
            };

        }else if(reportType === 'daily') {
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            
            dateFilter = {
                $or: [
                    { deliveredAt: { $gte: startOfDay, $lte: endOfDay } },
                    { 
                        paymentStatus: 'completed', createdAt: { $gte: startOfDay, $lte: endOfDay }
                    }
                ]
            };

        }else if(reportType === 'weekly') {
            const startOfWeek = new Date(now);
            const day = startOfWeek.getDay();
            const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
            startOfWeek.setDate(diff);
            startOfWeek.setHours(0, 0, 0, 0);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);
            
            dateFilter = {
                $or: [
                    { deliveredAt: { $gte: startOfWeek, $lte: endOfWeek } },
                    { 
                        paymentStatus: 'completed', createdAt: { $gte: startOfWeek, $lte: endOfWeek }
                    }
                ]
            };

        }else if(reportType === 'monthly') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfMonth.setHours(0, 0, 0, 0);
            
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endOfMonth.setHours(23, 59, 59, 999);
            
            dateFilter = {
                $or: [
                    { deliveredAt: { $gte: startOfMonth, $lte: endOfMonth } },
                    { 
                        paymentStatus: 'completed', createdAt: { $gte: startOfMonth, $lte: endOfMonth }
                    }
                ]
            };

        }else if(reportType === 'yearly') {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            startOfYear.setHours(0, 0, 0, 0);
            
            const endOfYear = new Date(now.getFullYear(), 11, 31);
            endOfYear.setHours(23, 59, 59, 999);
            
            dateFilter = {
                $or: [
                    { deliveredAt: { $gte: startOfYear, $lte: endOfYear } },
                    { 
                        paymentStatus: 'completed', createdAt: { $gte: startOfYear, $lte: endOfYear }
                    }
                ]
            };;
        }

        const query = {
            $or: [
                { orderStatus: { $in: ['delivered', 'returned'] } }, { paymentStatus: 'completed' }
            ],
            ...dateFilter
        }

        const totalOrders = await Order.countDocuments(query);

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const totalPages = Math.ceil(totalOrders / limitNum);

        const allOrders = await Order.find(query).populate('userId', 'fullName email').populate('couponApplied.couponId', 'code').sort({ createdAt: -1 }).lean();

        const paginatedOrders = await Order.find(query).populate('userId', 'fullName email').populate('couponApplied.couponId', 'code').sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean();

        //format orders function
        const formatOrders = (orders) => {
            return orders.map(order => {
                const relevantItems = order.items.filter(item => 
                    (item.status === 'active' || item.status === 'returned') && item.returnRequestStatus !== 'accepted');

                const activeItems = relevantItems.filter(item => item.status === 'active');
                const cancelledItems = order.items.filter(item => item.status === 'cancelled');
                const returnedItems = order.items.filter(item => item.status === 'returned' && item.returnRequestStatus === 'accepted');

                //calculate cancelled amount
                const cancelledAmount = cancelledItems.reduce((sum, item) => {
                    const itemAmount = item.finalPriceAfterDiscount || item.totalPrice;
                    return sum + itemAmount;
                }, 0);

                //calculate returned amount
                const returnedAmount = returnedItems.reduce((sum, item) => {
                    const itemAmount = item.finalPriceAfterDiscount || item.totalPrice;
                    return sum + itemAmount;
                }, 0);

                const paymentMethodFormatted = order.paymentMethod ? order.paymentMethod.toUpperCase() : 'N/A';

                return {
                    orderId: order.orderId,
                    orderDate: order.createdAt,
                    deliveryDate: order.deliveredAt || order.returnedAt,
                    customer: {
                        name: order.shippingAddress?.fullName || 'N/A',
                        email: order.userId?.email || 'N/A'
                    },
                    totalAmount: order.subtotal,
                    couponDiscount: order.discount || 0,
                    shipping: order.deliveryFee || 0,
                    finalPrice: order.subtotal - (order.discount || 0) + order.deliveryFee,
                    couponCode: order.couponApplied?.discountValue ? order.couponApplied.code : 'N/A',
                    cancelledAmount,
                    returnedAmount,
                    paymentMethod: paymentMethodFormatted,
                    status: order.orderStatus
                };
            });
        };

        const allFormattedOrders = formatOrders(allOrders);//calling the format orders function
        
        const formattedOrders = formatOrders(paginatedOrders);

        let totalSalesCount = allFormattedOrders.length;
        let totalOrderAmount = 0;
        let totalDiscountAmount = 0;
        let totalReturnedAmount = 0;
        let netAmount = 0;

        allFormattedOrders.forEach(order => {
            totalOrderAmount += order.totalAmount;
            totalDiscountAmount += order.couponDiscount;
            totalReturnedAmount += order.returnedAmount;
        });
        
        allOrders.forEach(order => {//calculate net amount from actual order data
            let orderNetAmount = order.subtotal -  (order.discount || 0) + order.deliveryFee;
                      
            order.items.forEach(item => {//subtract cancelled and returned items
                if (item.status === 'cancelled' || item.status === 'returned') {
                    const itemAmount = item.finalPriceAfterDiscount || item.totalPrice;
                    orderNetAmount -= itemAmount;
                }
            });        
            netAmount += orderNetAmount ;
        });

        const response = {
            success: true,
            data: {
                orders: formattedOrders,
                summary: {
                    totalSalesCount,
                    totalOrderAmount: Math.round(totalOrderAmount),
                    totalDiscount: Math.round(totalDiscountAmount),
                    returnedAmount: Math.round(totalReturnedAmount),
                    netAmount: Math.round(netAmount)
                },
                pagination: {
                    currentPage: pageNum,
                    totalPages,
                    totalOrders,
                    limit: limitNum,
                    hasNextPage: pageNum < totalPages,
                    hasPrevPage: pageNum > 1
                }
            }
        };

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(200).json(response);
        }

        return res.status(200).render('admin/salesReport/salesReports', {initialData: response});

    } catch (error) {
        console.error('error fetching sales report data:', error);
        return res.status(500).json({success: false, message: 'failed to fetch sales report data', error: error.message});
    }
}

module.exports = {
    getSalesReportData
}