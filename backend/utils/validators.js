const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isPhoneNumber = (phone) => /^[0-9]{10,15}$/.test(phone);

module.exports = { isEmail, isPhoneNumber };
