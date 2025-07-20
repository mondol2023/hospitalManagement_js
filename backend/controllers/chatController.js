const Chat = require('../models/Chat');
const User = require('../models/User');

const sendMessage = async (req, res, next) => {
  try {
    const { sender, receiver, message } = req.body;
    const chat = await Chat.create({ sender, receiver, message });
    res.status(201).json(chat);
  } catch (err) {
    next(err);
  }
};

const getChatHistory = async (req, res, next) => {
  try {
    const { user1, user2 } = req.query;
    const messages = await Chat.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    next(err);
  }
};

module.exports = { sendMessage, getChatHistory };
