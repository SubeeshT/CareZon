const User = require('../../models/userSchema');
const bcrypt = require('bcryptjs');
const sendOTPEmail = require('../../utils/sendEmail');
const path = require('path');
const fs = require('fs');

const loadProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        if (user.isBlocked === true) {
            return res.status(403).redirect('/signIn');
        }

        if (user.isAdmin === true) {
            return res.status(403).redirect('/signIn');
        }

        let googleUser = false;
        if (user.isGoogleUser === true) googleUser = true;

        return res.status(200).render('account/userProfile', { 
            success: true, 
            user, 
            googleUser, 
            activePage: 'profile'
        });
    } catch (error) {
        console.error('Internal error while loading profile: ', error);
        return res.status(500).render('pageNotFound');
    }
};

const editUserDetails = async (req, res) => {
    try {
        const user = await User.findById( req.session.userId);
        const { fullName, phone, DOB, gender } = req.body;

        // Validate required fields
        if (!fullName || !fullName.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Full name is required" 
            });
        }

        // Check if user is blocked or admin
        if (user.isBlocked) {
            return res.status(403).json({ 
                success: false, 
                message: "Account is blocked" 
            });
        }

        if (user.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: "Admin accounts cannot be modified" 
            });
        }

        // Validate phone number if provided
        if (phone && phone.trim()) {
            const phoneRegex = /^\d{10}$/;
            if (!phoneRegex.test(phone.trim())) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Please enter a valid 10-digit phone number" 
                });
            }

            // Check if phone number already exists (excluding current user)
            const existingPhone = await User.findOne({ 
                phone: phone.trim(), 
                _id: { $ne: user._id } 
            });
            if (existingPhone) {
                return res.status(409).json({ 
                    success: false, 
                    message: "Phone number already exists" 
                });
            }
        }

        // Validate DOB if provided
        let formattedDOB = null;
        if (DOB && DOB.trim()) {
            const dobDate = new Date(DOB);
            if (isNaN(dobDate.getTime())) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Please enter a valid date of birth" 
                });
            }
            
            // Check if DOB is not in future
            if (dobDate > new Date()) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Date of birth cannot be in the future" 
                });
            }
            
            formattedDOB = dobDate;
        }

        // Validate gender if provided
        const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
        if (gender && gender.trim() && !validGenders.includes(gender.trim())) {
            return res.status(400).json({ 
                success: false, 
                message: "Please select a valid gender" 
            });
        }

        // Update user details
        const updateData = {
            fullName: fullName.trim(),
        };

        if (phone && phone.trim()) {
            updateData.phone = phone.trim();
        }

        if (formattedDOB) {
            updateData.DOB = formattedDOB;
        }

        if (gender && gender.trim()) {
            updateData.gender = gender.trim();
        }

        const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true });

        if (!updatedUser) {
            return res.status(500).json({ 
                success: false, 
                message: "Failed to update user details" 
            });
        }

        return res.status(200).json({ 
            success: true, 
            message: "User details updated successfully", 
            user: {
                _id: updatedUser._id,
                fullName: updatedUser.fullName,
                phone: updatedUser.phone,
                DOB: updatedUser.DOB,
                gender: updatedUser.gender,
                email: updatedUser.email
            }
        });

    } catch (error) {
        console.error("Internal error while editing user: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error occurred" 
        });
    }
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Step 1: Initiate email change - Send OTP to current email
const initiateEmailChange = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        if (user.isGoogleUser === true || user.isAdmin === true) {
            return res.status(400).json({ 
                success: false, 
                message: "This user cannot change email" 
            });
        }

        if (user.isBlocked) {
            return res.status(403).json({ 
                success: false, 
                message: "This account is blocked by admin" 
            });
        }

        // Initialize email change session without OTP
        req.session.emailChange = {
            userId: user._id.toString(),
            currentEmail: user.email,
            step: 'verify-current'
        };

        res.status(200).json({ 
            success: true, 
            message: "Email change process initiated",
            step: 'verify-current'
        });

    } catch (error) {
        console.error("Internal error while initiating email change: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal error occurred while processing request" 
        });
    }
};

// Step 2: Verify current email OTP
const verifyCurrentEmail = async (req, res) => {
    try {
        const id = req.session.userId;
        const { otp } = req.body;

        if (!otp || otp.trim().length !== 6) {
            return res.status(400).json({ 
                success: false, 
                message: "Please provide a valid 6-digit OTP" 
            });
        }

        const emailChangeSession = req.session.emailChange;

        if (!emailChangeSession || emailChangeSession.userId !== id) {
            return res.status(400).json({ 
                success: false, 
                message: "No active email change session found. Please restart the process" 
            });
        }

        if (emailChangeSession.step !== 'verify-current') {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid step in email change process" 
            });
        }

        const currentEmailOTP = emailChangeSession.currentEmailOTP;

        if (new Date() > currentEmailOTP.expiresAt) {
            req.session.emailChange.currentEmailOTP = null;
            return res.status(400).json({ 
                success: false, 
                message: "OTP has expired. Please request a new OTP" 
            });
        }

        if (currentEmailOTP.code !== otp.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP. Please try again" 
            });
        }

        // Update session to next step
        req.session.emailChange.step = 'enter-new-email';
        req.session.emailChange.currentEmailVerified = true;

        return res.status(200).json({ 
            success: true, 
            message: "Current email verified successfully",
            step: 'enter-new-email'
        });

    } catch (error) {
        console.error("Internal error while verifying current email: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error occurred" 
        });
    }
};

// Step 3: Send OTP to new email
const sendOtp = async (req, res) => {
    try {
        const id = req.session.userId;
        const { type, newEmail } = req.body; // type: 'current-email' or 'new-email'
        const user = await User.findById(id);

        const emailChangeSession = req.session.emailChange;

        if (!emailChangeSession || emailChangeSession.userId !== id.toString()) {
            return res.status(400).json({ 
                success: false, 
                message: "No active email change session found. Please restart the process" 
            });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 1 * 60 * 1000); // 1 minute

        if (type === 'current-email') {
            // Send OTP to current email
            if (emailChangeSession.step !== 'verify-current') {
                return res.status(400).json({ 
                    success: false, 
                    message: "Invalid step in email change process" 
                });
            }

            console.log(`Email change OTP for current email: ${otp}`);

            req.session.emailChange.currentEmailOTP = {
                code: otp,
                expiresAt: otpExpires
            };

            await sendOTPEmail(user.email, otp, 'Verify Current Email for Email Change');
            
            return res.status(200).json({ 
                success: true, 
                message: `OTP sent to your current email: ${user.email}`,
                step: 'verify-current'
            });

        } else if (type === 'new-email') {
            // Send OTP to new email
            if (!newEmail || !newEmail.trim()) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Please provide a new email address" 
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(newEmail.trim())) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Please enter a valid email address" 
                });
            }

            if (!emailChangeSession.currentEmailVerified) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Please verify your current email first" 
                });
            }

            // Check if new email already exists
            const existingUser = await User.findOne({ 
                email: newEmail.trim().toLowerCase(), 
                _id: { $ne: id } 
            });
            if (existingUser) {
                return res.status(409).json({ 
                    success: false, 
                    message: "Email address already exists" 
                });
            }

            // Check if new email is same as current email
            if (user.email === newEmail.trim().toLowerCase()) {
                return res.status(400).json({ 
                    success: false, 
                    message: "New email cannot be same as current email" 
                });
            }

            console.log(`Email change OTP for new email: ${otp}`);

            // Update session with new email OTP
            req.session.emailChange.step = 'verify-new-email';
            req.session.emailChange.newEmail = newEmail.trim().toLowerCase();
            req.session.emailChange.newEmailOTP = {
                code: otp,
                expiresAt: otpExpires
            };

            await sendOTPEmail(newEmail.trim(), otp, 'Verify New Email Address');
            
            return res.status(200).json({ 
                success: true, 
                message: `OTP sent to your new email: ${newEmail.trim()}`,
                step: 'verify-new-email'
            });

        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP type specified" 
            });
        }

    } catch (error) {
        console.error("Internal error while sending OTP: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal error occurred while processing request" 
        });
    }
};
// Step 4: Verify new email OTP and save changes
const verifyNewEmailAndSave = async (req, res) => {
    try {
        const id = req.session.userId;
        const { otp } = req.body;

        if (!otp || otp.trim().length !== 6) {
            return res.status(400).json({ 
                success: false, 
                message: "Please provide a valid 6-digit OTP" 
            });
        }

        const emailChangeSession = req.session.emailChange;

        if (!emailChangeSession || emailChangeSession.userId !== id) {
            return res.status(400).json({ 
                success: false, 
                message: "No active email change session found" 
            });
        }

        if (emailChangeSession.step !== 'verify-new-email' || !emailChangeSession.newEmailOTP) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid step. Please send OTP to new email first" 
            });
        }

        const newEmailOTP = emailChangeSession.newEmailOTP;

        if (new Date() > newEmailOTP.expiresAt) {
            req.session.emailChange.newEmailOTP = null;
            return res.status(400).json({ 
                success: false, 
                message: "OTP has expired. Please request a new OTP" 
            });
        }

        if (newEmailOTP.code !== otp.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP. Please try again" 
            });
        }

        // Update user email in database
        const updatedUser = await User.findByIdAndUpdate(
            id, 
            { email: emailChangeSession.newEmail }, 
            { new: true }
        );

        if (!updatedUser) {
            return res.status(500).json({ 
                success: false, 
                message: "Failed to update email address" 
            });
        }

        // Clear email change session
        req.session.emailChange = null;

        return res.status(200).json({ 
            success: true, 
            message: "Email address updated successfully",
            newEmail: updatedUser.email
        });

    } catch (error) {
        console.error("Internal error while verifying new email: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error occurred" 
        });
    }
};

// Resend OTP functionality
const resendOTP = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const { type } = req.body; // 'current-email' or 'new-email'

        const emailChangeSession = req.session.emailChange;

        if (!emailChangeSession || emailChangeSession.userId !== user._id.toString()) {
            return res.status(400).json({ 
                success: false, 
                message: "No active email change session found" 
            });
        }

        if (type === 'current-email') {
            if (emailChangeSession.currentEmailOTP) {
                req.session.emailChange.currentEmailOTP = null;
            }
            const otp = generateOTP();
            console.log(`Resend Email change OTP for current email: ${otp}`);
            const otpExpires = new Date(Date.now() + 1 * 60 * 1000); // 1 minutes

            req.session.emailChange.currentEmailOTP = {
                code: otp,
                expiresAt: otpExpires
            };
            req.session.emailChange.currentEmailVerified = false;
            req.session.emailChange.step = 'verify-current';

            await sendOTPEmail(user.email, otp, 'Verify Current Email for Email Change');
            
            return res.status(200).json({ 
                success: true, 
                message: `OTP resent to your current email: ${user.email}` 
            });

        } else if (type === 'new-email') {
            if (emailChangeSession.newEmailOTP) {
                req.session.emailChange.newEmailOTP = null;
            }

            if (!emailChangeSession.newEmail) {
                return res.status(400).json({ 
                    success: false, 
                    message: "No new email found for OTP resend" 
                });
            }

            const otp = generateOTP();
            console.log(`Resend Email change OTP for new email: ${otp}`);
            const otpExpires = new Date(Date.now() + 1 * 60 * 1000); // 1 minutes

            req.session.emailChange.newEmailOTP = {
                code: otp,
                expiresAt: otpExpires
            };

            await sendOTPEmail(emailChangeSession.newEmail, otp, 'Verify New Email Address');
            
            return res.status(200).json({ 
                success: true, 
                message: `OTP resent to your new email: ${emailChangeSession.newEmail}` 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid OTP type" 
            });
        }

    } catch (error) {
        console.error("Internal error while resending OTP: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error occurred" 
        });
    }
};

// Password change functionality
const changePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate input fields
        if (!currentPassword || !currentPassword.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Current password is required" 
            });
        }

        if (!newPassword || !newPassword.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "New password is required" 
            });
        }

        if (!confirmPassword || !confirmPassword.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Please confirm your new password" 
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                message: "New password and confirm password do not match" 
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                message: "New password must be at least 8 characters long" 
            });
        }

        if (user.isBlocked) {
            return res.status(403).json({ 
                success: false, 
                message: "Account is blocked" 
            });
        }

        if (user.isGoogleUser) {
            return res.status(400).json({ 
                success: false, 
                message: "Google users cannot change password" 
            });
        }

        if (user.isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: "Admin accounts cannot be modified through this interface" 
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ 
                success: false, 
                message: "Current password is incorrect" 
            });
        }

        // Check if new password is same as current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ 
                success: false, 
                message: "New password cannot be same as current password" 
            });
        }

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        user.password = hashedNewPassword;
        await user.save();

        return res.status(200).json({ 
            success: true, 
            message: "Password updated successfully" 
        });

    } catch (error) {
        console.error("Internal error while changing password: ", error);
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error occurred" 
        });
    }
};

const uploadProfileImage = async (req, res) => {
    try {
        const userId = req.session.userId;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "User not authenticated" 
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        if (user.isBlocked) {
            return res.status(403).json({ 
                success: false, 
                message: "Account is blocked" 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: "No image file provided" 
            });
        }
        
        const profilesDir = 'uploads/profiles';
        if (!fs.existsSync(profilesDir)) {
            fs.mkdirSync(profilesDir, { recursive: true });
        }

        // Move file from temp to profiles directory
        const oldPath = req.file.path;
        const newFileName = `profile-${userId}-${Date.now()}${path.extname(req.file.originalname)}`;
        const newPath = path.join(profilesDir, newFileName);
        
        fs.renameSync(oldPath, newPath);

        // Delete old profile image if exists
        if (user.profileImage) {
            const oldImagePath = user.profileImage;
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        user.profileImage = newPath;
        await user.save();

        return res.status(200).json({ 
            success: true, 
            message: "Profile image updated successfully",
            imageUrl: `/${newPath.replace(/\\/g, '/')}`
            // imageUrl: `/${newPath}` 
        });

    } catch (error) {
        console.error("Error uploading profile image: ", error);
        
        // Delete uploaded file if error occurs
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({ 
            success: false, 
            message: "Internal server error occurred" 
        });
    }
};

module.exports = {
    loadProfile,
    editUserDetails,
    initiateEmailChange,
    verifyCurrentEmail,
    sendOtp,
    verifyNewEmailAndSave,
    resendOTP,
    changePassword,
    uploadProfileImage
};