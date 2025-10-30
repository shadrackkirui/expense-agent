// backend/index.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import fs from "fs/promises";
import path from "path";

import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createRetrieverTool } from "langchain/tools/retriever";
import { z } from "zod";

// --- 1. INITIALIZATION ---

const app = express();
const port = 8000;

// Middleware
app.use(express.json());
app.use(cors());

// Ensure the 'public' directory exists for file downloads
const publicDir = path.join(process.cwd(), 'public');
fs.mkdir(publicDir, { recursive: true });
app.use(express.static('public'));

// Initialize Supabase client
const privateKey = process.env.SUPABASE_KEY;
if (!privateKey) throw new Error(`Expected SUPABASE_KEY`);
const url = process.env.SUPABASE_URL;
if (!url) throw new Error(`Expected SUPABASE_URL`);
const client = createClient(url, privateKey);

// Initialize Gemini models
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "gemini-2.0-flash-lite",
  
  temperature: 0.3,
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
});

// Initialize Supabase vector store
const vectorstore = new SupabaseVectorStore(embeddings, {
  client,
  tableName: "documents",
  queryName: "match_documents",
});

const retriever = vectorstore.asRetriever();

// --- 2. DEFINE TOOLS ---

// This tool will search the vector store for relevant policy information.
const retrieverTool = await createRetrieverTool(retriever, {
  name: "expense_policy_search",
  description:
    "Use this tool to search for information about the corporate expense policy. For any questions about expense rules, limits, and procedures, you must use this tool!",
});


// This tool will write a new expense claim to a file.
const expenseClaimTool = new DynamicStructuredTool({
  name: "submit_expense_claim",
  description: "Use this to submit an expense claim. The user must provide their email, a description, and the amount.",
  schema: z.object({
    email: z.string().email().describe("The email address of the person submitting the claim."),
    description: z.string().describe("A description of the expense."),
    amount: z.number().describe("The amount of the expense claim."),
  }),
  func: async ({ email, description, amount }) => {
    try {
      const { error } = await client
        .from('claims')
        .insert({ email, description, amount, status: 'Submitted' });

      if (error) throw new Error(`Error saving to database: ${error.message}`);

      console.log(`Claim saved to Supabase for ${email}`);
      // The agent will return this message to the user.
      return `Successfully submitted expense claim for ${email}. The details have been recorded in the database.`;
    } catch (error) {
      console.error("Error saving claim:", error);
      return "Failed to submit expense claim due to an internal error.";
    }
  },
});

const getUserClaimsTool = new DynamicStructuredTool({
  name: "get_user_claims",
  description: "Use this to get a list of all past expense claims submitted by a user. You must provide the user's email address.",
  schema: z.object({
    email: z.string().email().describe("The email address of the user whose claims you want to retrieve."),
  }),
  func: async ({ email }) => {
    try {
      const { data, error } = await client
        .from('claims')
        .select('id, description, amount, status, created_at')
        .eq('email', email);

      if (error) throw new Error(`Error fetching from database: ${error.message}`);

      if (!data || data.length === 0) {
        return `No past claims found for ${email}.`;
      }

      const formattedClaims = data.map(claim => 
        `- Claim ID ${claim.id}: ${claim.description} for $${claim.amount} (Status: ${claim.status}, Submitted on: ${new Date(claim.created_at).toLocaleDateString()})`
      ).join('\n');

      return `Here are the past claims for ${email}:\n${formattedClaims}`;
    } catch (error) {
      console.error("Error fetching claims:", error);
      return "Failed to retrieve claims due to an internal error.";
    }
  },
});

const tools = [retrieverTool, expenseClaimTool, getUserClaimsTool];

// --- 3. CREATE THE AGENT ---

const agentPrompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a friendly and helpful AI assistant for corporate expenses. Your goal is to make handling expenses as easy as possible.

If a user asks what you can do, introduce yourself and clearly explain your three main functions.

1.  **Answering Questions**: Answer questions about the corporate expense policy. You MUST use the 'expense_policy_search' tool for this.
2.  **Submitting Claims**: Submit a new expense claim. You MUST use the 'submit_expense_claim' tool after collecting the required details (email, description, and amount).
3.  **Checking Past Claims**: Retrieve a list of all past claims for a user. You MUST use the 'get_user_claims' tool and ask for their email address.

**CRITICAL RULES**:
- NEVER confirm that a claim has been submitted unless the 'submit_expense_claim' tool has been successfully called and has returned a success message.
- If a user provides all the details for a claim in a single message, you MUST call the 'submit_expense_claim' tool with those details. Do not just reply that it is done without using the tool.
- Do not answer policy questions from memory. Always use the 'expense_policy_search' tool.`],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

const agent = await createToolCallingAgent({
  llm: model,
  tools,
  prompt: agentPrompt,
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: false,
});

// --- 4. DEFINE API ENDPOINT ---

const chatHistory = [];

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const result = await agentExecutor.invoke({
      input: message,
      chat_history: chatHistory,
    });

    // Store history
    chatHistory.push({ role: "human", content: message });
    chatHistory.push({ role: "ai", content: result.output });

    res.json({
      response: result.output,
    });
  } catch (error) {
    console.error("Error processing chat:", error);
    res.status(500).json({ error: "Failed to get a response from the agent." });
  }
});

// --- 5. START SERVER ---

app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});
