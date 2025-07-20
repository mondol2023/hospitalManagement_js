const multer = require('multer');
const { v4: uuid } = require('uuid');
const path = require('path');

const storage = multer.diskStorage({
  filename: (req, file, cb) => {
    cb(null, uuid() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const isAllowed = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  cb(null, isAllowed);
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
