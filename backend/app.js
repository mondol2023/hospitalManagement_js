const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('./middleware/ratelimit');
const errorHandler = require('./middleware/errorhandler');

const routes = require('./routes');
const app = express();

app.use(cors());
app.use(helmet());
app.use(rateLimit);
app.use(morgan('dev'));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/beds', require('./routes/beds'));
app.use('/api/emergency', require('./routes/emergency'));

app.use(errorHandler);

module.exports = app;
