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
  saveFiles(sessionId: String!, files: [FileInput!]!,title: String): Boolean!
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

  type File {
    path: String!
    content: String!
    type: String!
  }

  input FileInput {
    path: String!
    content: String!
    type: String!
  }

  type ChatSession {
    id: ID!
    sessionId: String!
    title: String
    messages: [Message!]!
    folderStructure: [File]
    createdAt: String!
    updatedAt: String!
  }

  type ChatSessionSummary {
    sessionId: String!
    title: String
    createdAt: String!
    updatedAt: String!
  }
`;

module.exports = typeDefs;