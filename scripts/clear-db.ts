import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

async function clearDb() {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log("Connected");
  await mongoose.connection.db?.collection("reservations").deleteMany({});
  await mongoose.connection.db?.collection("seatlocks").deleteMany({});
  
  await mongoose.connection.db?.collection("seatlocks").insertOne({ name: "global_reservation", version: 0 });

  console.log("DB Cleared and Lock Initialized");
  process.exit(0);
}

clearDb();
