const http = require('http');
const socketIo = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const redis = require('./config/redis');
const socketHandlers = require('./socket/socketHandlers');

const PORT = process.env.PORT || 5000;

connectDB();

require('dotenv').config();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

socketHandlers(io);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
