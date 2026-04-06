import mongoose from "mongoose";
import dotenv from "dotenv";
import { info, error } from "../utils/logger.js";

dotenv.config();

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    error("MONGODB_URI is not defined in environment variables.");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    if (conn?.connection?.readyState === 1) {
      info(`MongoDB Connected: ${conn.connection.host}`);
    } else {
      error("MongoDB connection not established properly.");
      process.exit(1);
    }
  } catch (err) {
    error("Database connection error:", err.message);
    process.exit(1);
  }
};

export default connectDB;
