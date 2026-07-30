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

  // ── 1. Idempotency check (no transaction needed — just a read) ──────────────
  const existing = await Reservation.findOne({ email: normalizedEmail });

  if (existing) {
    if (existing.status === "CONFIRMED") {
      throw new APIError(400, "Email already has a confirmed seat");
    }
    if (existing.status === "HELD" && existing.expiresAt > new Date()) {
      return res.status(200).json(
        new ApiResponse(200, { holdId: existing.holdId, expiresAt: existing.expiresAt })
      );
    }
    // Expired hold: remove it so the email can try again
    await Reservation.deleteOne({ _id: existing._id });
  }

  // ── 2. Atomically claim a seat slot via conditional $inc ────────────────────
  // Only increment if occupied < TOTAL_SEATS.
  const counter = await SeatCounter.findOneAndUpdate(
    { name: "global", occupied: { $lt: TOTAL_SEATS } },
    { $inc: { occupied: 1 } },
    { upsert: false, new: true }
  );

  if (!counter) {
    // Either the document didn't exist yet OR occupied >= 30 — treat both as sold out.
    // Ensure the document exists for future requests.
    await SeatCounter.findOneAndUpdate(
      { name: "global" },
      { $setOnInsert: { occupied: 0 } },
      { upsert: true }
    );
    throw new APIError(400, "Sold out");
  }

  // ── 3. Create the hold document ─────────────────────────────────────────────
  const holdId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

  try {
    const newReservation = await Reservation.create({
      email: normalizedEmail,
      status: "HELD",
      holdId,
      expiresAt,
    });

    return res.status(201).json(
      new ApiResponse(201, { holdId: newReservation.holdId, expiresAt: newReservation.expiresAt })
    );
  } catch (err) {
    // If the Reservation.create fails, release the slot we just claimed
    await SeatCounter.findOneAndUpdate(
      { name: "global" },
      { $inc: { occupied: -1 } }
    );
    throw err;
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
