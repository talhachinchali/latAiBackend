const typeDefs = `#graphql
  type Query {
    askAi(prompt: String,suggestions: String,sessionId: String,messages: [String!], image: String): AIResponse
    template(prompt: String!,apiKey: String): TemplateResponse
    suggestCode(prompt: String!): String
     me: User
    getChatHistory(sessionId: String!): ChatSession
    getUserChatSessions: [ChatSessionSummary!]!
  }

  type AIResponse {
    response: String!
    suggestions: String
  }
  type TemplateResponse {
    prompts: [String!]!
    uiPrompts: [String!]!
  } 

  type Subscription {
    aiResponse(prompt: String!, sessionId: String,messages: [String!],suggestions: String,image: String,apiKey: String): String
  }

  type Mutation {
  googleAuth(code: String!): AuthResponse
  logout: Boolean!
  deleteChatSession(sessionId: String!): Boolean!
} 

  type User {
    id: ID!
    googleId: String!
    email: String!
    name: String!
    picture: String
    createdAt: String
    lastLogin: String
  }

  type AuthResponse {
    user: User!
    token: String!
  }

  type Message {
    role: String!
    content: String!
    timestamp: String!
  }

  type ChatSession {
    id: ID!
    sessionId: String!
    messages: [Message!]!
    createdAt: String!
    updatedAt: String!
  }

  type ChatSessionSummary {
    sessionId: String!
    createdAt: String!
    updatedAt: String!
  }
`;

module.exports = typeDefs;