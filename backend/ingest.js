// backend/ingest.js
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createClient } from "@supabase/supabase-js";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import mammoth from "mammoth";
import "dotenv/config";

const privateKey = process.env.SUPABASE_KEY;
if (!privateKey) throw new Error(`Expected SUPABASE_KEY`);

const url = process.env.SUPABASE_URL;
if (!url) throw new Error(`Expected SUPABASE_URL`);

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) throw new Error(`Expected GOOGLE_API_KEY`);

// The name of your .docx file
const docxFilename = "expenses-policy.docx";

export const run = async () => {
  try {
    // 1. Load the document using mammoth
    console.log(`Loading content from ${docxFilename}...`);
    const { value: text } = await mammoth.extractRawText({ path: docxFilename });
    const doc = new Document({ pageContent: text });

    // 2. Split the document into chunks
    console.log("Splitting document into chunks...");
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const splitDocs = await splitter.splitDocuments([doc]);

    // 3. Initialize Supabase client
    const client = createClient(url, privateKey);

    // 4. Create embeddings and store in Supabase
    console.log("Creating embeddings and ingesting into Supabase...");
    await SupabaseVectorStore.fromDocuments(
      splitDocs,
      new GoogleGenerativeAIEmbeddings({ apiKey: GOOGLE_API_KEY }),
      {
        client,
        tableName: "documents",
        queryName: "match_documents",
      }
    );

    console.log("✅ Ingestion complete. Your data is now in Supabase.");
  } catch (e) {
    console.error("❌ Ingestion failed:", e);
    process.exit(1);
  }
};

run();
