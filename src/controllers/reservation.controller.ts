import { Request, Response } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { Reservation } from "../models/reservation.model.js";
import { APIError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

const TOTAL_SEATS = 30;

// SeatCounter schema — one document with name="global" holds the current occupied count.
// All increments are atomic via findOneAndUpdate.
const seatCounterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  occupied: { type: Number, default: 0 },
});
const SeatCounter =
  mongoose.models.SeatCounter ||
  mongoose.model("SeatCounter", seatCounterSchema);

// Helper for email validation
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const reserveSeat = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    throw new APIError(400, "Invalid email address");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const session = await mongoose.startSession();

  const lockSchema = new mongoose.Schema({ name: { type: String, unique: true }, version: { type: Number, default: 0 } });
  const SeatLock = mongoose.models.SeatLock || mongoose.model("SeatLock", lockSchema);

  try {
    let statusCode = 201;
    let responseData: any = null;

    await session.withTransaction(async () => {
      // 1. Lazy reconciliation: Update expired holds atomically
      await Reservation.updateMany(
        { status: "HELD", expiresAt: { $lte: new Date() } },
        { $set: { status: "EXPIRED" } },
        { session }
      );

      // 2. Global serialization lock to prevent parallel check-then-act race conditions
      await SeatLock.findOneAndUpdate(
        { name: "global_reservation" },
        { $inc: { version: 1 } },
        { upsert: true, returnDocument: "after", session }
      );

      // 3. Idempotency Check
      const existing = await Reservation.findOne({ email: normalizedEmail }).session(session);

      if (existing) {
        if (existing.status === "CONFIRMED") {
          throw new APIError(400, "Email already has a confirmed seat");
        }
        if (existing.status === "HELD" && existing.expiresAt > new Date()) {
          statusCode = 200;
          responseData = { holdId: existing.holdId, expiresAt: existing.expiresAt };
          return;
        }
        // If expired, delete it so the email can try again
        await Reservation.deleteOne({ _id: existing._id }).session(session);
      }

      // 4. Calculate occupied seats dynamically using ONLY active holds and confirmed seats
      const occupiedCount = await Reservation.countDocuments({
        $or: [
          { status: "CONFIRMED" },
          { status: "HELD", expiresAt: { $gt: new Date() } }
        ]
      }).session(session);

      if (occupiedCount >= TOTAL_SEATS) {
        throw new APIError(400, "Sold out");
      }

      // 5. Create new hold
      const holdId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now

      const newReservation = await Reservation.create(
        [
          {
            email: normalizedEmail,
            status: "HELD",
            holdId,
            expiresAt,
          },
        ],
        { session }
      );

      statusCode = 201;
      responseData = { holdId: newReservation[0].holdId, expiresAt: newReservation[0].expiresAt };
    });

    return res.status(statusCode).json(new ApiResponse(statusCode, responseData));
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
});

export const confirmReservation = asyncHandler(async (req: Request, res: Response) => {
  const { holdId } = req.body;

  if (!holdId) {
    throw new APIError(400, "holdId is required");
  }

  // Find the reservation
  const reservation = await Reservation.findOne({ holdId });

  if (!reservation) {
    throw new APIError(400, "Hold has expired or is invalid");
  }

  if (reservation.status === "CONFIRMED") {
    // Idempotent success
    return res.status(200).json(new ApiResponse(200, { message: "Reservation already confirmed" }));
  }

  if (reservation.status === "EXPIRED" || (reservation.status === "HELD" && reservation.expiresAt <= new Date())) {
    if (reservation.status === "HELD") {
      reservation.status = "EXPIRED";
      await reservation.save();
    }
    throw new APIError(400, "Hold has expired or is invalid");
  }

  // It's a valid active hold, confirm it
  reservation.status = "CONFIRMED";
  await reservation.save();

  return res.status(200).json(new ApiResponse(200, { message: "Reservation confirmed successfully" }));
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  // 1. Reconcile expired holds
  await Reservation.updateMany(
    { status: "HELD", expiresAt: { $lte: new Date() } },
    { $set: { status: "EXPIRED" } }
  );

  // 2. Calculate counts
  const confirmed = await Reservation.countDocuments({ status: "CONFIRMED" });
  const held = await Reservation.countDocuments({
    status: "HELD",
    expiresAt: { $gt: new Date() },
  });

  const totalSeats = 30;
  const available = Math.max(0, totalSeats - (confirmed + held));

  return res.status(200).json(
    new ApiResponse(200, {
      totalSeats,
      confirmed,
      held,
      available,
    })
  );
});

export const getReservationByEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.query;

  if (!email || typeof email !== "string") {
    throw new APIError(400, "Valid email query parameter is required");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const reservation = await Reservation.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

  if (!reservation) {
    return res.status(200).json(new ApiResponse(200, null, "No reservation found for this email"));
  }

  if (reservation.status === "HELD" && reservation.expiresAt <= new Date()) {
     reservation.status = "EXPIRED";
     await reservation.save();
  }

  return res.status(200).json(new ApiResponse(200, reservation));
});
