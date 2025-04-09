require('dotenv').config();
const { ApolloServer } = require('apollo-server-express');
const express = require('express');
const authMiddleware = require('./authMiddleware');
const { google } = require('googleapis');

const app = express();

// Auth middleware
app.use(authMiddleware);

// Setup Google OAuth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req, res }) => {
    // Make sure req is available
    if (!req) {
      return {};
    }
    return {
      req,
      res,
      oauth2Client
    };
  },
});

await server.start();
server.applyMiddleware({ 
  app,
  cors: {
    credentials: true,
    origin: true
  }
});