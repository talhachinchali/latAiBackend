require('dotenv').config();
const { createPubSub } = require('graphql-yoga');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { BASE_PROMPT, getSystemPrompt } = require('./prompts');
const  reactBasePrompt  = require('./defaults/react');
const  nodeBasePrompt  = require('./defaults/node');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const User = require('./models/User');
const ChatSession = require('./models/ChatSession');
require('./db/connection'); // Add this at the top with other requires

const pubsub = createPubSub();
const chatSessions = new Map();
const suggestCodeSessions = new Map();
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL // Your frontend callback URL
);

const tokenBlacklist = new Set(); 

const resolvers = {
  Query: {
    askAi: async (_, { prompt, suggestions, messages=[], image, sessionId = 'default' }) => {
      try {
        let chatSession;
        if (!chatSessions.has(sessionId)) {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
          });

          const generationConfig = {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
          };

          chatSession = model.startChat({
            generationConfig,
          });

          // Send system prompt first
          // await chatSession.sendMessage(getSystemPrompt());
          // console.log('system prompt sent',getSystemPrompt())
          // // Send node base prompt
          for(let i=0;i<messages.length-1;i++){
            await chatSession.sendMessage(messages[i]);
          }
          
          chatSessions.set(sessionId, chatSession);
        } else {
          chatSession = chatSessions.get(sessionId);
        }

        let result;
        // Send the actual user prompt with image if provided
        if(messages.length>0){
          const lastMessage = messages[messages.length-1];
          
          // If image is provided, create a multipart message
          if (image) {
            const imagePart = {
              inlineData: {
                data: image,
                mimeType: image.startsWith('data:image/') ? 
                  image.substring(5, image.indexOf(';')) : 'image/jpeg'
              }
            };
            
            const textPart = { text: lastMessage };
            result = await chatSession.sendMessage([imagePart, textPart]);
          } else {
            result = await chatSession.sendMessage(lastMessage);
          }
        }
        else if(suggestions && suggestions.length > 0){
          result = await chatSession.sendMessage("userCode: "+suggestions+"\n\n{dont give whole file code just give the code by which i can improve my code}");
        }
        else{
          console.log(prompt,"prompt");
          // If image is provided with direct prompt
          if (image) {
            const imagePart = {
              inlineData: {
                data: image,
                mimeType: image.startsWith('data:image/') ? 
                  image.substring(5, image.indexOf(';')) : 'image/jpeg'
              }
            };
            
            const textPart = { text: prompt || "Describe this image" };
            result = await chatSession.sendMessage([imagePart, textPart]);
          } else {

            result = await chatSession.sendMessage(prompt);
          }
        }
        const response = await result.response;
        const fullResponse = response.text();
        
        return {response:fullResponse,suggestions:suggestions?fullResponse:""};
      } catch (error) {
        console.error('Error in AI generation:', error);
        throw new Error('Failed to generate AI response');
      }
    },
    template: async (_, { prompt, apiKey }) => {
      try {
        console.log('template api key',apiKey||process.env.GEMINI_API_KEY)
        const genAI = new GoogleGenerativeAI(apiKey||process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.0-flash",
        });

        const systemPrompt = `Analyze the following prompt and determine if it's asking for a React.js project or a Node.js project. 
        Respond with ONLY one of these exact strings: "REACT" or "NODE" or "UNKNOWN" if it's unclear or neither.
        
        User prompt: ${prompt}`;

        const result = await model.generateContent(systemPrompt);
        const response = result.response.text().trim().toUpperCase();
        
 
        if (response == "REACT") {
          return {
              prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt.basePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
              uiPrompts: [reactBasePrompt.basePrompt]
          }
      }
  
      if (response === "NODE") {
          return {
              prompts: [`Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt.basePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
              uiPrompts: [nodeBasePrompt.basePrompt]
          }
      }
        
        return {
          prompts: [],
          uiPrompts: []
        };
      } catch (error) {
        console.error('Error in template detection:', error);
        throw new Error('Failed to determine template type');
      }
    },
    suggestCode: async (_, { prompt, sessionId = 'default' }) => {
      try {
        let chatSession;
        let systemPrompt = "## Task: Code Completion\n" +
        "### Language: JavaScript\n" +
        "### Instructions:\n" +
        "- You are a world-class coding assistant.\n" +
        "- Given the current text, context, and the last character of the user input, provide a suggestion for code completion.\n" +
        "- The suggestion must be based on the current text, as well as the text before the cursor.\n" +
        "- The cursor position is marked with `/* SUGGESTION_POINT */`.\n" +
        "- Use the surrounding 10 lines above and below `/* SUGGESTION_POINT */` as context.\n" +
        "- Ensure that the suggestion follows proper syntax and structure.\n\n" +
        "### Rules:\n" +
        "- If an opening tag (`<div`, `<p`, `<span`, etc.) is started, provide a properly closed tag.\n" +
        "- If the cursor is inside a class attribute (`class=\"...\"`), suggest only valid Tailwind CSS class names.\n" +
        "- Newlines should be included after `{`, `[`, `(`, `)`, `]`, `}`, and `,`.\n" +
        "- Never suggest a newline after a space or newline.\n" +
        "- Maintain indentation consistency with the current line.\n" +
        "- The suggestion must start with the last character of the current user input.\n" +
        "- Never include any markdown formatting such as code blocks (` ``` `).\n" +
        "- Never return annotations like \"# Suggestion:\" or \"# Suggestions:\".\n" +
        "- Do not return code that is already present in the current text.\n" +
        "- Ensure that the completion is always valid JavaScript/HTML/CSS.";
        

        if (!suggestCodeSessions.has(sessionId)) {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
          });

          const generationConfig = {
            temperature: 0.7,
            topP: 0.9,
            topK: 50,
            maxOutputTokens: 8192,
          };

          chatSession = model.startChat({
            generationConfig,
          });

          // Send the system prompt first
          if (systemPrompt) {
            await chatSession.sendMessage(systemPrompt);
          }

          suggestCodeSessions.set(sessionId, chatSession);
        } else {
          chatSession = suggestCodeSessions.get(sessionId);
        }

        // Send the user prompt to get suggestions
        const result = await chatSession.sendMessage(prompt);
        const response = await result.response;
        const fullResponse = response.text();

        // Extract specific code or suggestions from the response if needed
        // const specificSuggestion = extractSpecificSuggestion(fullResponse);

        return fullResponse;
      } catch (error) {
        console.error('Error in suggestion generation:', error);
        throw new Error('Failed to generate suggestion');
      }
    },
    me: async (_, __, { req }) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          throw new Error('Not authenticated');
        }

        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.SESSION_SECRET);
        
        const user = await User.findById(decoded.userId);
        if (!user) {
          throw new Error('User not found');
        }

        return {
          id: user._id,
          googleId: user.googleId,
          email: user.email,
          name: user.name,
          picture: user.picture,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        };
      } catch (error) {
        console.error('Error in me query:', error);
        throw new Error('Not authenticated');
      }
    },
    getChatHistory: async (_, { sessionId }, { req }) => {
      try {
        if (!req.user) {
          throw new Error('Not authenticated');
        }

        const chatSession = await ChatSession.findOne({
          userId: req.user.userId,
          sessionId
        });

        if (!chatSession) {
          throw new Error('Chat session not found');
        }

        return {
          id: chatSession._id,
          sessionId: chatSession.sessionId,
          title: chatSession.title,
          messages: chatSession.messages,
          folderStructure: chatSession.folderStructure,
          createdAt: chatSession.createdAt,
          updatedAt: chatSession.updatedAt
        };
      } catch (error) {
        console.error('Error fetching chat history:', error);
        throw new Error('Failed to fetch chat history');
      }
    },
    getUserChatSessions: async (_, __, { req }) => {
      try {
        if (!req.user) {
          throw new Error('Not authenticated');
        }

        const sessions = await ChatSession.find({ userId: req.user.userId })
          .sort({ updatedAt: -1 })
          .select('sessionId createdAt updatedAt title');

        return sessions;
      } catch (error) {
        console.error('Error fetching user chat sessions:', error);
        throw new Error('Failed to fetch chat sessions');
      }
    },
  },
  Mutation: {
    googleAuth: async (_, { code }, { req }) => {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log(tokens, "tokens");
        oauth2Client.setCredentials(tokens);

        // Get user info using the oauth2Client
        const oauth2Service = google.oauth2('v2');
        const userInfo = await oauth2Service.userinfo.get({
          auth: oauth2Client
        });

        // Create or update user in MongoDB
        const userData = {
          googleId: userInfo.data.id,
          email: userInfo.data.email,
          name: userInfo.data.name,
          picture: userInfo.data.picture,
          lastLogin: new Date()
        };

        // Find and update user, or create if doesn't exist
        const user = await User.findOneAndUpdate(
          { googleId: userData.googleId },
          userData,
          { 
            new: true,             // Return the updated document
            upsert: true,          // Create if doesn't exist
            setDefaultsOnInsert: true
          }
        );

        console.log('User saved:', user);

        // Generate JWT token with MongoDB _id
        const token = jwt.sign(
          { 
            userId: user._id,
            googleId: user.googleId
          },
          process.env.SESSION_SECRET,
          { expiresIn: '7d' }
        );

        return {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            picture: user.picture
          },
          token
        };
      } catch (error) {
        console.error('Error during Google authentication:', error);
        throw new Error('Authentication failed');
      }
    },

    logout: async (_, __, context) => {
      console.log("logout",context);
      try {
        // Get headers from context directly
        const headers = context?.req?.headers;
        console.log("logout headers:", headers);
        
        if (!headers?.authorization) {
          console.log("No authorization header found");
          return true; // Already logged out
        }

        const token = headers.authorization.replace('Bearer ', '');
        // Add the token to blacklist
        tokenBlacklist.add(token);
        console.log("Successfully logged out, token blacklisted");
        return true;
      } catch (error) {
        console.error("Logout failed:", error);
        throw new Error("Logout failed");
      }
    },
    deleteChatSession: async (_, { sessionId }, { req }) => {
      try {
        if (!req.user) {
          throw new Error('Not authenticated');
        }

        const result = await ChatSession.deleteOne({
          userId: req.user.userId,
          sessionId
        });

        return result.deletedCount > 0;
      } catch (error) {
        console.error('Error deleting chat session:', error);
        throw new Error('Failed to delete chat session');
      }
    },
    saveFiles: async (_, { sessionId, files,title }, { req }) => {
      try {
        if (!req.user) {
          throw new Error('Not authenticated');
        }

        const chatSession = await ChatSession.findOne({
          userId: req.user.userId,
          sessionId
        });

        if (!chatSession) {
          throw new Error('Chat session not found');
        }

        // Update the folder structure
        chatSession.folderStructure = files;
        chatSession.title = title;
        await chatSession.save();

        return true;
      } catch (error) {
        console.error('Error saving files:', error);
        throw new Error('Failed to save files');
      }
    },
  },
  Subscription: {
    aiResponse: {
      subscribe: async (_, { prompt, suggestions, messages=[], image, sessionId = 'default', apiKey }, context) => {
        try {
          // Check if user is authenticated
          if (!context?.req?.user) {
            console.log("Not authenticated");
            throw new Error('Not authenticated');
          }
          if(!prompt&&!messages.length){
            throw new Error('Prompt or messages are required');
          }

          let chatSession;
          let dbChatSession = await ChatSession.findOne({
            userId: context.req.user.userId,
            sessionId
          });

          if (!dbChatSession) {
            dbChatSession = new ChatSession({
              userId: context.req.user.userId,
              sessionId,
              messages: []
            });
          }

          if (!chatSessions.has(sessionId) || messages.length > 0) {
            const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
              model: "gemini-2.0-flash",
            });

            const generationConfig = {
              temperature: 1,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 8192,
              responseMimeType: "text/plain",
            };

            chatSession = model.startChat({
              generationConfig,
              history: [],
            });

            await chatSession.sendMessage(getSystemPrompt());
           
            // Load previous messages from database
            for (const msg of dbChatSession.messages) {
              await chatSession.sendMessage(msg.content);
            }

            // Add new messages
            for (let i = 0; i < messages.length - 1; i++) {
              await chatSession.sendMessage(messages[i]);
              dbChatSession.messages.push({
                role: 'user',
                content: messages[i]
              });
            }

            chatSessions.set(sessionId, chatSession);
          } else {
            chatSession = chatSessions.get(sessionId);
          }

          let result;
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            
            if (image) {
              const imagePart = {
                inlineData: {
                  data: image,
                  mimeType: image.startsWith('data:image/') ? 
                    image.substring(5, image.indexOf(';')) : 'image/jpeg'
                }
              };
              const textPart = { text: lastMessage };
              result = await chatSession.sendMessageStream([imagePart, textPart]);
            } else {
              result = await chatSession.sendMessageStream(lastMessage);
            }

            // Store user message
            dbChatSession.messages.push({
              role: 'user',
              content: lastMessage
            });
          } else {
            if (image) {
              const imagePart = {
                inlineData: {
                  data: image,
                  mimeType: image.startsWith('data:image/') ? 
                    image.substring(5, image.indexOf(';')) : 'image/jpeg'
                }
              };
              const textPart = { text: prompt };
              result = await chatSession.sendMessageStream([imagePart, textPart]);
            } else {
              result = await chatSession.sendMessageStream(prompt);
            }

            // Store user message
            dbChatSession.messages.push({
              role: 'user',
              content: prompt
            });
          }

          const channelId = `ai-response-${Date.now()}`;
          let fullResponse = '';

          (async () => {
            try {
              for await (const chunk of result.stream) {
                const text = await chunk.text();
                fullResponse += text;
                
                if (text) {
                  try {
                    await pubsub.publish(channelId, { 
                      aiResponse: text,
                      __typename: 'AiResponse'
                    });
                  } catch (publishError) {
                    console.error('Error publishing chunk:', publishError);
                  }
                }
              }
              
              // Store AI response
              dbChatSession.messages.push({
                role: 'assistant',
                content: fullResponse
              });

              // Save the updated chat session
              await dbChatSession.save();
              
              await pubsub.publish(channelId, { 
                aiResponse: null,
                __typename: 'AiResponse'
              });
            } catch (error) {
              console.error('Streaming error:', error);
              await pubsub.publish(channelId, { 
                aiResponse: "Error: Failed to generate streaming response",
                __typename: 'AiResponse'
              });
            }
          })();

          return pubsub.subscribe(channelId);
        } catch (error) {
          console.error('Error in AI generation:', error);
          throw new Error('Failed to generate AI response');
        }
      }
    }
  }
};

// Helper function to extract specific suggestions from the response
function extractSpecificSuggestion(response) {
  // Implement logic to parse and extract the specific suggestion you need
  // For example, you might want to extract only certain parts of the response
  return response; // Modify this as needed
}

module.exports = {
  resolvers,
  tokenBlacklist
};