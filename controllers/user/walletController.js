const loadWallet = async (req,res) => {
    try {
        return res.status(200).render('user/account/walletStatic', {activePage: 'wallet'})
    } catch (error) {
        
    }
}

module.exports = {
    loadWallet,

}