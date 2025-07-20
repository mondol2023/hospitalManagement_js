const User = require("../models/Users");

const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find();
        res.status(200).json(users);
    } catch (err) {
        next(err);
    }
};

const getUserId = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select(-"password");
        if(!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user);
    } catch (err) {
        next(err);
    }
};

const updateUser = async (req, res, next) => {
    try {
        const updateData = { ...req.body };
        delete updateData.password;
        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if(!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user);
    }catch (err) {
        next(err);
    }
};

const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if(!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json(user);
    } catch (err) {
        next(err);
    }  
} ;

module.exports = { getAllUsers, getUserId, updateUser, deleteUser };