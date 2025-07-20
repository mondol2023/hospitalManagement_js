const jwt = require("jsonwebtoken");
const User = require("../models/Users");
const bcrypt = require("bcrypt");
const { generateAccessToken , generateRefreshToken } = require("../utils/token");

const register = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ message: "User already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
            role,
        });
        res.status(200).json({ user , accessToken, refreshToken});
    }   catch(err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        res.status(200).json({ user, accessToken, refreshToken });
    } catch (err) {
        next(err);
    }
};

const refreshToken = async (req, res, next) => {
    try {
        const token = req.body;
        if (!token) {
            return res.status(401).json({ message: "Refresh token required" });
        }
        
        jwt.verify(token, process.env.JWT_REFRESH_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ message: "Invalid refresh token" });
            }
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);
            res.status(200).json({ accessToken, refreshToken });
        });
    } catch (err) {
        next(err);
    }      
};

module.exports = { register, login, refreshToken };