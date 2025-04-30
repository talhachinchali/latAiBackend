const jwt = require('jsonwebtoken');
const { tokenBlacklist } = require('./resolvers'); // Export tokenBlacklist from resolvers

const authMiddleware = async (req, res, next) => {
  console.log("baby he loves you  2",req.body)
  console.log("papapa",process.env.SESSION_SECRET)
  // Skip auth check for Google Auth mutation
  const isGoogleAuthOperation = req.body?.query?.includes('mutation GoogleAuth');
  if (isGoogleAuthOperation) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');

    // Check if token is blacklisted
    if (tokenBlacklist.has(token)) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.SESSION_SECRET);
      req.user = decoded;
    } catch (err) {
      console.error('Token verification failed:', err);
      req.user = null;
      return res.status(401).json({ message: 'Unauthorized' });
    }
  }
  else {
    req.user = null;
    return res.status(401).json({ message: 'Unauthorized' });
  }

  next();
};

module.exports = authMiddleware;