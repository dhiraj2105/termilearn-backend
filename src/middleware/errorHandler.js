import { error as logError } from "../utils/logger.js";

export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message || "Server Error";

  logError(err);

  if (err.name === "CastError") {
    error = { message: "Resource not found", statusCode: 404 };
  }

  if (err.code === 11000) {
    error = { message: "Duplicate field value entered", statusCode: 400 };
  }

  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = { message, statusCode: 400 };
  }

  if (err.name === "JsonWebTokenError") {
    error = { message: "Invalid token", statusCode: 401 };
  }

  if (err.name === "TokenExpiredError") {
    error = { message: "Token expired", statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
