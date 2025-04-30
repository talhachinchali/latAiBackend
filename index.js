const express = require('express');
const dotenv = require('dotenv');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { createServer } = require('http');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const typeDefs = require('./typedefs');
const { resolvers, tokenBlacklist } = require('./resolvers');
const authMiddleware = require('./authMiddleware');
const cors = require('cors');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();

// Order matters! First parse JSON, then apply other middleware
app.use(express.json());

app.use(cors({
  origin: process.env.FRONTEND_URL, // Your frontend URL
  credentials: true
}));

// Add Cross-Origin headers for WebContainer compatibility
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// app.use(cors({
//   origin: function (origin, callback) {
//     // Allow all origins (or allow specific ones dynamically)
//     callback(null, true);
//   },
//   credentials: true
// }));

// app.use(cors());
app.use(authMiddleware);

const port = 3000;

// Create schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create Apollo Server
const server = new ApolloServer({
  schema,
});

// Create HTTP server
const httpServer = createServer(app);

// Create WebSocket server
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

// Use the WebSocket server with context
const serverCleanup = useServer({
  schema,
  context: async (ctx) => {
    // Get the authorization header from the connection params
    const authHeader = ctx.connectionParams?.authorization;
    if (!authHeader) {
      return { req: { user: null } };
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      // Check if token is blacklisted
      if (tokenBlacklist.has(token)) {
        return { req: { user: null } };
      }
console.log("pppp",process.env.SESSION_SECRET,token)
      const decoded = jwt.verify(token, process.env.SESSION_SECRET);
      return { req: { user: decoded } };
    } catch (err) {
      console.error('Token verification failed:', err);
      return { req: { user: null } };
    }
  }
}, wsServer);

// Start server and apply middleware
async function startServer() {
  await server.start();
  
  app.use('/graphql', 
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        return {
          req,
          res
        };
      },
    })
  );

  httpServer.listen(port, () => {
    console.log(`🚀 Server ready at http://localhost:${port}/graphql`);
    console.log(`🚀 Subscriptions ready at ws://localhost:${port}/graphql`);
  });
}

startServer();