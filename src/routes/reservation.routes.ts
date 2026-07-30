import { Router } from "express";
import {
  reserveSeat,
  confirmReservation,
  getStatus,
  getReservationByEmail,
} from "../controllers/reservation.controller.js";

const router = Router();

router.post("/reserve", reserveSeat);
router.post("/confirm", confirmReservation);
router.get("/status", getStatus);
router.get("/reservations", getReservationByEmail);

export default router;
