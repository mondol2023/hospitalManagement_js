const sendSMS = async (to, message) => {
  console.log(`Sending SMS to ${to}: ${message}`);
};

module.exports = { sendSMS };
