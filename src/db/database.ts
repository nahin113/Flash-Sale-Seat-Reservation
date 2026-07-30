import mongoose from "mongoose";

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI as string, {
            maxPoolSize: 100,
            minPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        })
        console.log("MongoDB connected")
    } catch (error) {
        console.error("MongoDB connection error", error)
        process.exit(1)
    }
}

export default connectDB