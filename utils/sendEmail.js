const nodemailer = require('nodemailer');

const sendOTPEmail = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
    });

    const mailOptions = {
        from: `"CareZon" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP code is : ${otp}. It will expire in 1 minute`,
        };

    await transporter.sendMail(mailOptions);
};

const sendContactEmail = async (contactData) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
    });

    const mailOptions = {
        from: `"CareZon" <${process.env.SMTP_USER}>`,
        to: process.env.SMTP_USER, 
        subject: `New Contact Form Submission - ${contactData.subject}`,
        html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${contactData.firstName} ${contactData.lastName}</p>
            <p><strong>Email:</strong> ${contactData.email}</p>
            <p><strong>Phone:</strong> ${contactData.phone}</p>
            <p><strong>Subject:</strong> ${contactData.subject}</p>
            <p><strong>Message:</strong></p>
            <p>${contactData.message}</p>
            <p><strong>Newsletter Subscription:</strong> ${contactData.newsletter ? 'Yes' : 'No'}</p>
        `,
    };

    await transporter.sendMail(mailOptions);
};


module.exports = {
    sendOTPEmail,
    sendContactEmail 
};

