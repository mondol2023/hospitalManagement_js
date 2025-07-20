const generateOTP = (length = 6) => {
  return Math.floor(Math.random() * Math.pow(10, length)).toString();
};

const formatDate = (date) => {
  return new Date(date).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
};

module.exports = { generateOTP, formatDate };
