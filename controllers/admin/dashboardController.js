const Order = require('../../models/orderSchema');
const { getPointColor, generateChartData, getTopProducts, getTopCategories, getTopBrands } = require('../../utils/dashboardHelper');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');


const loadDashboard = async (req, res) => {
  try {
    const { filterType = 'daily', startDate, endDate } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch(filterType) {
      case 'daily':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999))
          }
        };
        break;
      case 'weekly':
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        dateFilter = { createdAt: { $gte: weekAgo } };
        break;
      case 'monthly':
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        dateFilter = { createdAt: { $gte: monthAgo } };
        break;
      case 'yearly':
        const threeYearsAgo = new Date(now.getFullYear() - 2, 0, 1);
        dateFilter = { createdAt: { $gte: threeYearsAgo } };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            }
          };
        }
        break;
      default:
        dateFilter = {};
    }

    const orders = await Order.find({...dateFilter, paymentStatus: 'completed'}).populate('items.productId');

    let totalRevenue = 0;
    let totalOrders = orders.length;
    
    orders.forEach(order => {
      let orderTotal = order.totalAmount;
      
      order.items.forEach(item => {
        if (item.status === 'cancelled' || item.status === 'returned') {
          orderTotal -= (item.finalPriceAfterDiscount || item.totalPrice);
        }
      });
      
      totalRevenue += orderTotal;
    });

    const totalUsers = await Order.distinct('userId', dateFilter).then(ids => ids.length);

    //calculate sales chart data
    const chartData = await generateChartData(filterType, startDate, endDate, dateFilter);

    //get top 10 products
    const topProducts = await getTopProducts(dateFilter);

    //get top 10 categories
    const topCategories = await getTopCategories(dateFilter);

    //get top 10 brands
    const topBrands = await getTopBrands(dateFilter);

    //generate colors for each data point
    const pointColors = chartData.data.map(amount => getPointColor(amount, filterType));

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(200).json({
          success: true,
          data: {
            filterType: filterType,
            stats: {
              totalRevenue,
              totalOrders,
              totalUsers
            },
            chartData: {
              ...chartData,
              pointColors: pointColors
            },
            topProducts,
            topCategories,
            topBrands
          }
        });
    }

    return res.status(200).render("dashboard/dashboard", {message: "dashboard loaded"});

  } catch (error) {
    console.log("Failed to fetch dashboard data", error);
    return res.status(500).json({ success: false, message: "Internal error while fetching dashboard data" });
  }
};

const downloadLedgerPDF = async (req, res) => {
  try {
    const { filterType = 'daily', startDate, endDate } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch(filterType) {
      case 'daily':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999))
          }
        };
        break;
      case 'weekly':
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        dateFilter = { createdAt: { $gte: weekAgo } };
        break;
      case 'monthly':
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        dateFilter = { createdAt: { $gte: monthAgo } };
        break;
      case 'yearly':
        const threeYearsAgo = new Date(now.getFullYear() - 2, 0, 1);
        dateFilter = { createdAt: { $gte: threeYearsAgo } };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            }
          };
        }
        break;
    }

    const orders = await Order.find({...dateFilter, paymentStatus: 'completed'}).populate('items.productId');
    
    let totalRevenue = 0;
    orders.forEach(order => {
      let orderTotal = order.totalAmount;
      order.items.forEach(item => {
        if (item.status === 'cancelled' || item.status === 'returned') {
          orderTotal -= (item.finalPriceAfterDiscount || item.totalPrice);
        }
      });
      totalRevenue += orderTotal;
    });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-ledger-${filterType}-${Date.now()}.pdf`);
    
    doc.pipe(res);

    doc.fontSize(20).text('CAREZON ADMIN', { align: 'center' });
    doc.fontSize(16).text('Sales Ledger Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'right' });
    doc.text(`Filter: ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`, { align: 'right' });
    
    if (filterType === 'custom' && startDate && endDate) {
      doc.text(`Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, { align: 'right' });
    }
    
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(12).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Orders: ${orders.length}`);
    doc.text(`Total Revenue: ₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    doc.text(`Average Order Value: ₹${orders.length > 0 ? (totalRevenue / orders.length).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}`);
    doc.moveDown();

    doc.fontSize(12).text('Order Details', { underline: true });
    doc.moveDown(0.5);
    
    const tableTop = doc.y;
    const tableHeaders = ['Order ID', 'Date', 'Amount', 'Status'];
    const colWidths = [120, 120, 100, 100];
    let xPos = 50;
    
    doc.fontSize(9).fillColor('#000');
    tableHeaders.forEach((header, i) => {
      doc.text(header, xPos, tableTop, { width: colWidths[i], align: 'left' });
      xPos += colWidths[i];
    });
    
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown(0.5);

    let yPos = doc.y;
    orders.slice(0, 30).forEach(order => {
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }
      
      xPos = 50;
      let orderTotal = order.totalAmount;
      order.items.forEach(item => {
        if (item.status === 'cancelled' || item.status === 'returned') {
          orderTotal -= (item.finalPriceAfterDiscount || item.totalPrice);
        }
      });
      
      doc.fontSize(8);
      doc.text(order.orderId, xPos, yPos, { width: colWidths[0], align: 'left' });
      xPos += colWidths[0];
      doc.text(new Date(order.createdAt).toLocaleDateString(), xPos, yPos, { width: colWidths[1], align: 'left' });
      xPos += colWidths[1];
      doc.text(`₹${orderTotal.toLocaleString('en-IN')}`, xPos, yPos, { width: colWidths[2], align: 'left' });
      xPos += colWidths[2];
      doc.text(order.orderStatus, xPos, yPos, { width: colWidths[3], align: 'left' });
      
      yPos += 20;
    });

    if (orders.length > 30) {
      doc.moveDown();
      doc.fontSize(8).text(`Showing first 30 orders. Total orders: ${orders.length}`, { align: 'center', color: '#666' });
    }

    doc.fontSize(8).text('Generated by Carezon Admin Dashboard', 50, doc.page.height - 50, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ success: false, message: 'Error generating PDF' });
  }
};

const downloadLedgerExcel = async (req, res) => {
  try {
    const { filterType = 'daily', startDate, endDate } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch(filterType) {
      case 'daily':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999))
          }
        };
        break;
      case 'weekly':
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        dateFilter = { createdAt: { $gte: weekAgo } };
        break;
      case 'monthly':
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        dateFilter = { createdAt: { $gte: monthAgo } };
        break;
      case 'yearly':
        const threeYearsAgo = new Date(now.getFullYear() - 2, 0, 1);
        dateFilter = { createdAt: { $gte: threeYearsAgo } };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            }
          };
        }
        break;
    }

    const orders = await Order.find({...dateFilter, paymentStatus: 'completed'})
      .populate('items.productId')
      .populate('userId', 'fullName email');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Ledger');

    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = 'CAREZON ADMIN - Sales Ledger Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.getCell('A3').value = 'Generated:';
    worksheet.getCell('B3').value = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    worksheet.getCell('A4').value = 'Filter Type:';
    worksheet.getCell('B4').value = filterType.charAt(0).toUpperCase() + filterType.slice(1);
    
    if (filterType === 'custom' && startDate && endDate) {
      worksheet.getCell('A5').value = 'Period:';
      worksheet.getCell('B5').value = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
    }

    let totalRevenue = 0;
    orders.forEach(order => {
      let orderTotal = order.totalAmount;
      order.items.forEach(item => {
        if (item.status === 'cancelled' || item.status === 'returned') {
          orderTotal -= (item.finalPriceAfterDiscount || item.totalPrice);
        }
      });
      totalRevenue += orderTotal;
    });

    const summaryRow = filterType === 'custom' && startDate && endDate ? 7 : 6;
    worksheet.getCell(`A${summaryRow}`).value = 'Total Orders:';
    worksheet.getCell(`B${summaryRow}`).value = orders.length;
    worksheet.getCell(`A${summaryRow + 1}`).value = 'Total Revenue:';
    worksheet.getCell(`B${summaryRow + 1}`).value = `₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    worksheet.getCell(`A${summaryRow + 2}`).value = 'Average Order Value:';
    worksheet.getCell(`B${summaryRow + 2}`).value = orders.length > 0 ? `₹${(totalRevenue / orders.length).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00';

    const headerRow = summaryRow + 4;
    const headers = ['Order ID', 'Date', 'Customer', 'Payment Method', 'Items', 'Subtotal', 'Discount', 'Final Amount', 'Status'];
    worksheet.getRow(headerRow).values = headers;
    worksheet.getRow(headerRow).font = { bold: true };
    worksheet.getRow(headerRow).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    let rowIndex = headerRow + 1;
    orders.forEach(order => {
      let orderTotal = order.totalAmount;
      order.items.forEach(item => {
        if (item.status === 'cancelled' || item.status === 'returned') {
          orderTotal -= (item.finalPriceAfterDiscount || item.totalPrice);
        }
      });

      worksheet.getRow(rowIndex).values = [
        order.orderId,
        new Date(order.createdAt).toLocaleDateString('en-IN'),
        order.userId?.fullName || 'N/A',
        order.paymentMethod.toUpperCase(),
        order.items.length,
        `₹${order.subtotal.toLocaleString('en-IN')}`,
        `₹${order.discount.toLocaleString('en-IN')}`,
        `₹${orderTotal.toLocaleString('en-IN')}`,
        order.orderStatus
      ];
      rowIndex++;
    });

    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    worksheet.getColumn(1).width = 20;
    worksheet.getColumn(3).width = 20;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-ledger-${filterType}-${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).json({ success: false, message: 'Error generating Excel' });
  }
};

module.exports = {
  loadDashboard,
  downloadLedgerPDF,
  downloadLedgerExcel
}