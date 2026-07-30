import mongoose, { Schema, Document, Model } from "mongoose";

export interface IReservation extends Document {
  email: string;
  status: "HELD" | "CONFIRMED" | "EXPIRED";
  holdId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReservationModel extends Model<IReservation> {
  getActiveSeatCount(): Promise<number>;
}

const reservationSchema = new Schema<IReservation, IReservationModel>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["HELD", "CONFIRMED", "EXPIRED"],
      default: "HELD",
    },
    holdId: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for checking if the hold is still active
reservationSchema.virtual("isActiveHold").get(function (this: IReservation) {
  return this.status === "HELD" && this.expiresAt > new Date();
});

// Static method to get the active seat count
reservationSchema.statics.getActiveSeatCount = async function (): Promise<number> {
  const count = await this.countDocuments({
    $or: [
      { status: "CONFIRMED" },
      { status: "HELD", expiresAt: { $gt: new Date() } },
    ],
  });
  return count;
};

export const Reservation = mongoose.model<IReservation, IReservationModel>(
  "Reservation",
  reservationSchema
);
