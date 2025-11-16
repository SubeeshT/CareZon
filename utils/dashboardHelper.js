const Order = require('../models/orderSchema');

const getPointColor = (amount, filterType) => {
  let targets;
  
  switch(filterType) {
    case 'daily':
      targets = {
        min: 10000,
        low: 20000,
        medium: 50000,
        high: 80000
      };
      break;
    case 'weekly':
      targets = {
        min: 70000,      
        low: 140000,   
        medium: 350000,
        high: 560000   
      };
      break;
    case 'monthly':
      targets = {
        min: 300000,    
        low: 600000,    
        medium: 1500000,
        high: 2400000   
      };
      break;
    case 'yearly':
      targets = {
        min: 3650000,    
        low: 7300000,    
        medium: 18250000,
        high: 29200000   
      };
      break;
    case 'custom':
      targets = {
        min: 10000,
        low: 20000,
        medium: 50000,
        high: 80000
      };
      break;
    default:
      targets = {
        min: 10000,
        low: 20000,
        medium: 50000,
        high: 80000
      };
  }
  
  if (amount >= targets.high) {
    return 'rgba(40, 167, 69, 1)'; 
  } else if (amount >= targets.medium) {
    return 'rgba(255, 193, 7, 1)';
  } else if (amount >= targets.low) {
    return 'rgba(253, 126, 20, 1)'; 
  } else {
    return 'rgba(220, 53, 69, 1)'; 
  }
};

const generateChartData = async (filterType, startDate, endDate, dateFilter) => {
  
  let groupBy, labels;
  const now = new Date();
  
  switch(filterType) {
    case 'yearly':
      const yearLabels = [];
      const currentYear = now.getFullYear();
      for (let i = 2; i >= 0; i--) {
        yearLabels.push((currentYear - i).toString());
      }
      
      const yearlyData = await Order.aggregate([
        {
          $match: {
            paymentStatus: 'completed', createdAt: { $gte: new Date(currentYear - 2, 0, 1) }
          }
        },
        {
          $group: {
            _id: { $year: '$createdAt' }, total: { $sum: '$totalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      
      const yearlyMap = {};
      yearlyData.forEach(item => {
        yearlyMap[item._id] = item.total;
      });
      
      return {
        labels: yearLabels,
        data: yearLabels.map(year => yearlyMap[year] || 0)
      };
      
    case 'monthly':
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      const monthlyData = await Order.aggregate([
        {
          $match: {
            paymentStatus: 'completed',
            createdAt: { $gte: new Date(now.getFullYear(), 0, 1) }
          }
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            total: { $sum: '$totalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      
      const monthlyMap = {};
      monthlyData.forEach(item => {
        monthlyMap[item._id] = item.total;
      });
      
      return {
        labels,
        data: labels.map((_, index) => monthlyMap[index + 1] || 0)
      };
      
    case 'weekly':
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      const weeklyData = [];
      
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i + 1) * 7);
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() - i * 7);
        
        const total = await Order.aggregate([
          {
            $match: {
              paymentStatus: 'completed', createdAt: { $gte: weekStart, $lte: weekEnd }
            }
          },
          {
            $group: {
              _id: null, total: { $sum: '$totalAmount' }
            }
          }
        ]);
        
        weeklyData.push(total[0]?.total || 0);
      }
      
      return { labels, data: weeklyData };
      
    case 'daily':
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
      
      const dailyData = await Order.aggregate([
        {
          $match: {
            paymentStatus: 'completed',
            createdAt: {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1),
              $lte: new Date(now.getFullYear(), now.getMonth(), daysInMonth, 23, 59, 59)
            }
          }
        },
        {
          $group: {
            _id: { $dayOfMonth: '$createdAt' },
            total: { $sum: '$totalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      
      const dailyMap = {};
      dailyData.forEach(item => {
        dailyMap[item._id] = item.total;
      });
      
      return {
        labels,
        data: labels.map(day => dailyMap[parseInt(day)] || 0)
      };
      
    case 'custom':
      if (!startDate || !endDate) return { labels: [], data: [] };
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      
      const customLabels = [];
      const customData = [];
      
      for (let i = 0; i < daysDiff; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        customLabels.push(currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const dayStart = new Date(currentDate.setHours(0, 0, 0, 0));
        const dayEnd = new Date(currentDate.setHours(23, 59, 59, 999));
        
        const total = await Order.aggregate([
          {
            $match: {
              paymentStatus: 'completed', createdAt: { $gte: dayStart, $lte: dayEnd }
            }
          },
          {
            $group: {
              _id: null, total: { $sum: '$totalAmount' }
            }
          }
        ]);
        
        customData.push(total[0]?.total || 0);
      }
      
      return { labels: customLabels, data: customData };
      
    default:
      return { labels: [], data: [] };
  }
};

const getTopProducts = async (dateFilter) => {
  
  const topProducts = await Order.aggregate([
    { $match: { ...dateFilter, paymentStatus: 'completed' } },
    { $unwind: '$items' },
    {
      $match: {
        'items.status': 'active'
      }
    },
    {
      $group: {
        _id: '$items.productId',
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.finalPriceAfterDiscount' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' }
  ]);
  
  return topProducts.map(item => ({
    name: item.product.name,
    sold: item.totalSold,
    revenue: item.totalRevenue
  }));
};

const getTopCategories = async (dateFilter) => {
  
  const topCategories = await Order.aggregate([
    { $match: { ...dateFilter, paymentStatus: 'completed' } },
    { $unwind: '$items' },
    {
      $match: {
        'items.status': 'active'
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.category',
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.finalPriceAfterDiscount' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category'
      }
    },
    { $unwind: '$category' }
  ]);
  
  return topCategories.map(item => ({
    name: item.category.name,
    sold: item.totalSold,
    revenue: item.totalRevenue
  }));
};

const getTopBrands = async (dateFilter) => {
  
  const topBrands = await Order.aggregate([
    { $match: { ...dateFilter, paymentStatus: 'completed' } },
    { $unwind: '$items' },
    {
      $match: {
        'items.status': 'active'
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $group: {
        _id: '$product.brand',
        totalSold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.finalPriceAfterDiscount' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'brands',
        localField: '_id',
        foreignField: '_id',
        as: 'brand'
      }
    },
    { $unwind: '$brand' }
  ]);
  
  return topBrands.map(item => ({
    name: item.brand.name,
    sold: item.totalSold,
    revenue: item.totalRevenue
  }));
};

module.exports = {
  getPointColor,
  generateChartData,
  getTopProducts,
  getTopCategories,
  getTopBrands
};