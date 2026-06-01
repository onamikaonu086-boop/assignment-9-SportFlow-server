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
    const facilityCollection = db.collection("facilities");
    const bookingCollection = db.collection("bookings");

    const auth = betterAuth({
      baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8000",
      secret: process.env.BETTER_AUTH_SECRET,
      database: mongodbAdapter(db),
      emailAndPassword: { enabled: true },
      socialProviders: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      },
      trustedOrigins: [process.env.CLIENT_URL || "http://localhost:3000"],
    });

    const corsOptions = {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    };

    app.use(cors(corsOptions));
    app.use(express.json());
    app.all(["/api/auth", "/api/auth/{*splat}"], toNodeHandler(auth));

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




   app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}


startServer();