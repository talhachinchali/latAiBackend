const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const fileSchema = new mongoose.Schema({
  path: {
    type: String,
    required: true
  },
  content: {
    type: String,
    // required: true
  },
  type: {
    type: String,
    enum: ['file', 'directory'],
    required: true
  }
});

const chatSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    // required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  messages: [messageSchema],
  folderStructure: [fileSchema],
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
chatSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

module.exports = ChatSession; 