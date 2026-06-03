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
const defaultClientURL = "https://assignment-9-sport-flow.vercel.app";
const clientOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  defaultClientURL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, ""));

if (!uri) {
  throw new Error("MONGODB_URI is not defined");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("sportflowDB");
const facilityCollection = db.collection("facilities");
const bookingCollection = db.collection("bookings");
const connectPromise = client.connect().then(() => {
  console.log("Connected to MongoDB");
});

const normalizeAuthURL = (value) => {
  if (!value) return "http://localhost:8000";
  return value.replace(/\/$/, "").replace(/\/api\/auth$/, "");
};

const auth = betterAuth({
  baseURL: normalizeAuthURL(process.env.BETTER_AUTH_URL),
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(db),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  trustedOrigins: clientOrigins,
});

const corsOptions = {
  origin(origin, callback) {
    if (!origin || clientOrigins.includes(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.all(["/api/auth", "/api/auth/{*splat}"], toNodeHandler(auth));
app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await connectPromise;
    next();
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

const verifySession = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    req.user = session.user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

app.get("/", (req, res) => {
  res.send("SportFlow Server is running!");
});


app.get("/facilities", async (req, res) => {
      const { search, type } = req.query;
      const query = {};

      if (search) query.name = { $regex: search, $options: "i" };
      if (type) query.facility_type = { $in: type.split(",") };

      const facilities = await facilityCollection.find(query).toArray();
      res.send(facilities);
    });

app.get("/facilities/:id", async (req, res) => {
      const { ObjectId } = await import("mongodb");
      const facility = await facilityCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!facility) return res.status(404).json({ error: "Facility not found" });
      res.send(facility);
    });


app.post("/add-facility", verifySession, async (req, res) => {
      const result = await facilityCollection.insertOne(req.body);
      res.send(result);
    });

app.get("/my-facilities", verifySession, async (req, res) => {
      const facilities = await facilityCollection
        .find({ owner_email: req.user.email })
        .toArray();
      res.send(facilities);
    });


app.put("/facilities/:id", verifySession, async (req, res) => {
      const { ObjectId } = await import("mongodb");
      const facility = await facilityCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!facility) return res.status(404).json({ error: "Not found" });
      if (facility.owner_email !== req.user.email)
        return res.status(403).json({ error: "Forbidden" });

      const { _id, owner_email, booking_count, ...updateData } = req.body;
      const result = await facilityCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData }
      );
      res.send(result);
    });

app.delete("/facilities/:id", verifySession, async (req, res) => {
      const { ObjectId } = await import("mongodb");
      const facility = await facilityCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!facility) return res.status(404).json({ error: "Not found" });
      if (facility.owner_email !== req.user.email)
        return res.status(403).json({ error: "Forbidden" });

      const result = await facilityCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });


app.post("/bookings", verifySession, async (req, res) => {
      const booking = {
        ...req.body,
        user_email: req.user.email,
        status: "pending",
        created_at: new Date(),
      };
      const result = await bookingCollection.insertOne(booking);

      const { ObjectId } = await import("mongodb");
      await facilityCollection.updateOne(
        { _id: new ObjectId(booking.facility_id) },
        { $inc: { booking_count: 1 } }
      );

      res.send(result);
    });

app.get("/my-bookings", verifySession, async (req, res) => {
      const bookings = await bookingCollection
        .find({ user_email: req.user.email })
        .sort({ created_at: -1 })
        .toArray();
      res.send(bookings);
    });

app.patch("/bookings/:id/cancel", verifySession, async (req, res) => {
      const { ObjectId } = await import("mongodb");
      const result = await bookingCollection.updateOne(
        { _id: new ObjectId(req.params.id), user_email: req.user.email },
        { $set: { status: "cancelled" } }
      );
      res.send(result);
    });
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
