import dotenv from "dotenv";

dotenv.config({
  path: "./.env",
});

import app from "./app.js";
import connectDB from "./db/database.js";

const port = process.env.PORT || 5000;

connectDB().then(()=> {
  app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
}).catch(err => {
  console.error("MongoDB connection error", err)
  process.exit(1)
})

