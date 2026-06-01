import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { toNodeHandler } from "better-auth/node";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const uri = process.env.MONGODB_URI;


if (!uri) {
  console.error("MONGODB_URI is not defined in .env file");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});



async function startServer() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db("sportflowDB");



    app.get("/", (req, res) => {
      res.send("SportFlow Server is running!");
    });



    
   app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}


startServer();