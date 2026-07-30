import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISeatCounter extends Document {
  name: string;
  occupied: number;
}

export interface ISeatCounterModel extends Model<ISeatCounter> {}

const seatCounterSchema = new Schema<ISeatCounter, ISeatCounterModel>({
  name: { type: String, required: true, unique: true },
  occupied: { type: Number, default: 0 },
});

export const SeatCounter = mongoose.model<ISeatCounter, ISeatCounterModel>(
  "SeatCounter",
  seatCounterSchema
);
