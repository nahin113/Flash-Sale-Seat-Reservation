import dotenv from "dotenv";

dotenv.config({
  path: "./.env",
});

import app from "./app.js";
import connectDB from "./db/database.js";

const port = process.env.PORT || 5000;

// Initialize Database Connection
connectDB().catch(err => {
  console.error("MongoDB connection error during initialization", err);
});

// Avoid calling app.listen in serverless / Vercel environments
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

export default app;

