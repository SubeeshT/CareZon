const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');

const loadAddress = async(req, res) =>{
    try {
        const user = await User.findById(req.session.userId);
        const addresses = await Address.find({userId: req.session.userId}).sort({createdAt: -1});   

        return res.status(200).render('account/address', {activePage: 'address', addresses, user, success: true, message: null});
    } catch (error) {
        console.error("internal error while loading address : ", error);
        return res.status(500).render('pageNotFound',{status: 500, message: "Something went wrong while loading addresses"});
    }
}

const addAddress = async (req,res)=> {
    try {
        const { fullName, phoneOne, phoneTwo, pin, locality, area, district, state, country, landmark, addressType} = req.body;
        const user = await User.findById(req.session.userId);

        if(!fullName || !phoneOne || !pin || !locality || !area || !district || !state || !country || !addressType){
            return res.status(400).json({success: false, message: "required field should fill"});
        }

        if(phoneOne.length !== 10 || (phoneTwo && phoneTwo.length !== 10)){
            return res.status(400).json({success: false, message: "Phone number should have 10 digits"});
        }

        const newAddress = new Address({
            userId: req.session.userId,
            fullName: fullName.trim(), 
            phoneOne, 
            phoneTwo: phoneTwo || null, 
            pin, 
            locality: locality.trim(), 
            area: area.trim(), 
            district: district.trim(), 
            state: state.trim(), 
            country: country.trim(), 
            landmark: landmark.trim() || null, 
            addressType: addressType,
            isDefault: req.body.isDefault === 'true' || req.body.isDefault === true
        });

        if (newAddress.isDefault) {
            await Address.updateMany({ userId: req.session.userId }, { isDefault: false });
        }
         
        await newAddress.save();

        return res.status(201).json({success: true, message: "Address added successfully", address: newAddress});

    } catch (error) {
        console.error("internal error while add address : ", error);
        return res.status(500).json({success: false, message: "server error while adding address"});
    }
}

const editAddress = async (req,res)=> {
    try {
        const addressId = req.params.addressId;
        const {fullName, phoneOne, phoneTwo, pin, locality, area, district, state, country, landmark, addressType} = req.body;

        const addressOwner = await Address.findOne({_id: addressId, userId: req.session.userId});

        if(!addressOwner){
            return res.status(401).json({success: false, message: "this user cant change this address, should change the account"});
        }

        if(!fullName || !phoneOne || !pin || !locality || !area || !district || !state || !country || !addressType){
            return res.status(400).json({success: false, message: "Required field should be fill"});
        }

        if(phoneOne.length !== 10 || (phoneTwo && phoneTwo.length !== 10)){
            return res.status(400).json({success: false, message: "phone number should have 10 digit"});
        }

        const isDefaultRequested = req.body.isDefault === 'true' || req.body.isDefault === true;
        if (isDefaultRequested && !addressOwner.isDefault) {
            await Address.updateMany({ userId: req.session.userId }, { isDefault: false });
        }

        addressOwner.fullName = fullName.trim();
        addressOwner.phoneOne = phoneOne;
        addressOwner.phoneTwo = phoneTwo || null;
        addressOwner.pin = pin ;
        addressOwner.locality = locality.trim();
        addressOwner.area = area.trim() ;
        addressOwner.district = district.trim();
        addressOwner.state = state;
        addressOwner.country = country;
        addressOwner.landmark = landmark ? landmark.trim() : null;
        addressOwner.addressType = addressType
        addressOwner.isDefault = isDefaultRequested;

        await addressOwner.save();

        return res.status(200).json({success: true, message: "address edit successfully", address: addressOwner})

    } catch (error) {
        console.error("internal error get while edit address : ", error);
        return res.status(500).json({success: false, message: "error get while edit address"});
    }
}

const deleteAddress = async (req,res) => {
    try {
        const addressId = req.params.addressId;

         const addressOwner = await Address.findOne({_id: addressId, userId: req.session.userId});

        if(!addressOwner){
            return res.status(401).json({success: false, message: "this user cant delete the address"});
        }

        await Address.deleteOne({_id: addressId});

        return res.status(200).json({success: true, message: "address delete successfully"});  

    } catch (error) {
        console.error("internal error get while delete address : ", error);
        return res.status(500).json({success: false, message: "error get while delete address"});
    }
} 

const setDefaultAddress = async(req, res) => {
    try {
        const { addressId } = req.params;
        
        const addressOwner = await Address.findOne({_id: addressId, userId: req.session.userId});

        if (!addressOwner) {
            return res.status(404).json({success: false, message: "this user cant change the default address"});
        }

        await Address.updateMany({ userId: req.session.userId }, { isDefault: false });

        addressOwner.isDefault = true;
        await addressOwner.save();

        return res.status(200).json({success: true, message: "Default address updated successfully"});

    } catch (error) {
        console.error("internal Error setting default address: ", error);
        return res.status(500).json({success: false, message: "Failed to set default address"});
    }
}


module.exports = {
    loadAddress,
    addAddress,
    editAddress,
    deleteAddress ,
    setDefaultAddress
}