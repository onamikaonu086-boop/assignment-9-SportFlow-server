import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const uri = process.env.MONGODB_URI;

app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

if (!uri) {
  console.error("❌ Error: MONGODB_URI is not defined in .env file!");
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
    console.log("Connected to MongoDB!");

    const database = client.db("sportflowDB");
    const facilityCollection = database.collection("facilities");

    app.get("/", (req, res) => {
      res.send("SportFlow Server is running perfectly!");
    });

    app.post("/add-facility", async (req, res) => {
      const facilityData = req.body;
      console.log("Data received:", facilityData);
      const result = await facilityCollection.insertOne(facilityData);
      res.send(result);
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

startServer();