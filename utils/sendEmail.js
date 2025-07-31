const nodemailer = require('nodemailer')

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


module.exports = sendOTPEmail;

