// models/Request.js
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  products: [
    {
      serialNumber: Number,
      productName: String,
      inputUrls: [String],
      outputUrls: [String]
    }
  ],
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);
