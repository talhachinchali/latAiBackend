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

dotenv.config();

const app = express();

// Order matters! First parse JSON, then apply other middleware
app.use(express.json());

app.use(cors({
  origin: process.env.FRONTEND_URL, // Your frontend URL
  credentials: true
}));
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

// Use the WebSocket server
const serverCleanup = useServer({ schema }, wsServer);

// Start server and apply middleware
async function startServer() {
  await server.start();
  
  app.use('/graphql', 
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        // Make sure to return the context object
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
