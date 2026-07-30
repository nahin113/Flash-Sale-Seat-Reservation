import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { APIError } from "./utils/api-error.js";
import { ApiResponse } from "./utils/api-response.js";

const app = express();

// Middleware to parse JSON bodies
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
// app.use(express.static("public")) this is for making a folder publicly available 


app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}))

// import the routes
import healthCheckRouter from "./routes/healthcheck.routes.js"

app.use("/api/v1/healthcheck", healthCheckRouter)

// Root route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  let error = err;
  
  if (!(error instanceof APIError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || "Something went wrong";
    error = new APIError(statusCode, message, error?.errors || [], error.stack);
  }

  const response = new ApiResponse(error.statusCode, error.data, error.message);
  
  res.status(error.statusCode).json({
    ...response,
    errors: error.errors
  });
});

export default app;
