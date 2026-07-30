import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

async function clearDb() {
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log("Connected");

  await mongoose.connection.db?.collection("reservations").deleteMany({});
  await mongoose.connection.db?.collection("seatcounters").deleteMany({});
  await mongoose.connection.db?.collection("seatlocks").deleteMany({});

  // Initialize the global SeatCounter at 0
  await mongoose.connection.db
    ?.collection("seatcounters")
    .insertOne({ name: "global", occupied: 0 });

  console.log("DB cleared and SeatCounter initialized.");
  process.exit(0);
}

clearDb();
