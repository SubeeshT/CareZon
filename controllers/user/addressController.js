const Address = require('../../models/addressSchema');
const User = require('../../models/userSchema');

const loadAddress = async(req, res) =>{
    try {
        const user = await User.findById(req.session.userId);

        if(user.isBlocked === true || user.isAdmin === true){
            return res.status(400).redirect('/signIn', {success: false, message: "This user cant enter the page, You should change the account"});
        }

        const addresses = await Address.find({userID: req.session.userId}).sort({createdAt: -1});
        

        return res.status(200).render('account/address', {activePage: 'address', addresses, user });
    } catch (error) {
        console.error("internal error while loading address : ", error);
        return res.status(500).json({success: false, message: "address loading get error"});
    }
}

const addAddress = async (req,res)=> {
    try {
        const { fullName, phoneOne, phoneTwo, pin, locality, area, district, state, country, landmark, addressType} = req.body;
        const user = await User.findById(req.session.userId);
        
        if(user.isBlocked === true || user.isAdmin === true){
            return res.status(400).json({success: false, message: "this user cant add address, Please change the account "});
        }

        if(!fullName || !phoneOne || !pin || !locality || !area || !district || !state || !country || !addressType){
            return res.status(400).json({success: false, message: "required field should fill"});
        }

        switch(addressType){
            case 'home':
                addressType = 'home';
                break;
            case 'work':
                addressType = 'work';
                break;
            case 'other':
                addressType = 'other';
                break;            
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
            addressType: addressType.trim(),
        });

        await newAddress.save();

        return res.status(201).render("account/address", {success: true, address: newAddress, user, message: "address added successfully"});

    } catch (error) {
        console.error("internal error while add address : ", error);
        return res.status(500).json({success: false, message: "server error while adding product"});
    }
}

module.exports = {
    loadAddress,
    addAddress,

}