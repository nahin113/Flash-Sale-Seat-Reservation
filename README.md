# Flash Sale Seat Reservation API

A high-concurrency backend built with **Express**, **TypeScript**, and **MongoDB** to manage a flash-sale seat reservation system with strict limits under parallel load.

---

## Setup

1. **Clone the repo** and install dependencies:
   ```bash
   npm install
   ```

2. **Configure environment** — create a `.env` file in the root:
   ```env
   PORT=5000
   CORS_ORIGIN=*
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.ugd8t6z.mongodb.net/flash-sale?retryWrites=true&w=majority
   ```

3. **Start the server**:
   ```bash
   npm run dev
   ```

4. **Run the concurrency load test**:
   ```bash
   # Ensure server is running first
   npx tsx scripts/clear-db.ts   # clear + initialize lock doc
   npm run test:load
   ```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/reserve` | Reserve a seat (hold for 2 min) |
| `POST` | `/api/confirm` | Confirm an active hold |
| `GET` | `/api/status` | Get seat availability counts |
| `GET` | `/api/reservations?email=` | Get reservation status for email |
| `GET` | `/api/v1/healthcheck` | Server health check |

### POST `/api/reserve`
```json
// Request
{ "email": "user@example.com" }

// Response 201
{ "statusCode": 201, "data": { "holdId": "uuid", "expiresAt": "ISO date" }, "success": true }
```

### POST `/api/confirm`
```json
// Request
{ "holdId": "uuid" }

// Response 200
{ "statusCode": 200, "data": { "message": "Reservation confirmed successfully" }, "success": true }
```

### GET `/api/status`
```json
// Response 200
{
  "statusCode": 200,
  "data": { "totalSeats": 30, "confirmed": 5, "held": 10, "available": 15 },
  "success": true
}
```

---

## Assessment Questions

### 1. How is overselling prevented under 100 parallel requests?

The system prevents overselling through **MongoDB transactions with a global serialization lock**:

1. Each `POST /api/reserve` call opens a **MongoDB client session** and calls `session.withTransaction()`.
2. Inside the transaction, a **global lock document** (`SeatLock` collection, `name: "global_reservation"`) is acquired atomically via `findOneAndUpdate(..., { $inc: { version: 1 } }, { upsert: true, session })`. Because all concurrent transactions write to the same single document under snapshot isolation, MongoDB's write conflict detection forces all but one to **retry or abort** — effectively serializing requests at the database engine level.
3. After acquiring the lock, the count of occupied seats (`CONFIRMED` + active `HELD` where `expiresAt > NOW()`) is computed within the same transaction session.
4. If `count >= 30`, the transaction throws a `400 Sold out` error and aborts. Otherwise the new hold document is created and committed atomically.

This ensures that **no two concurrent transactions can both read "29 seats taken" and both successfully create the 30th hold** — the second one will either wait for the first to commit, detect the write conflict, and retry (finding `count = 30`), or fail outright.

---

### 2. How do expired holds release seats safely under concurrency?

Expired holds are managed through **lazy reconciliation** — no background cron job or scheduler is needed:

- The `expiresAt` field on each hold document records the exact UTC timestamp when the hold expires (2 minutes from creation).
- All seat-counting queries **always filter with `expiresAt: { $gt: new Date() }`** when counting `HELD` seats. This means an expired hold is automatically excluded from the active count the moment its `expiresAt` passes, without any explicit update needed.
- On `GET /api/status`, an `updateMany` runs first to reconcile documents (`status: "HELD"` AND `expiresAt <= NOW()` → `status: "EXPIRED"`). This keeps the database clean but is **not required for correctness** — the timestamp filter guarantees accuracy regardless.
- On `GET /api/reservations?email=` and `POST /api/confirm`, individual documents are lazily updated to `EXPIRED` on read if their hold time has passed.

This design eliminates race conditions that arise from cron-based expiry (e.g., a cron and a concurrent `confirm` both touching the same document), because **the expiry is a function of time already encoded in the data**, not a separate process action.

---

### 3. Trade-off chosen due to the 24-hour time constraint

The architecture deliberately chose **lazy reconciliation over Redis TTL / distributed locks**:

| Approach | Pros | Cons |
|----------|------|------|
| **Redis TTL + Pub/Sub** | Near-zero expiry latency, very fast reads | Requires Redis infra, two data stores to keep in sync, operational complexity |
| **Distributed Lock (Redlock)** | Strong guarantees across multiple nodes | Requires Redis cluster, complex failure handling, more moving parts |
| **MongoDB Transactions + lock doc** *(chosen)* | Single data store, atomic at DB engine level, simple deployment | Slightly higher write latency under burst (serial transactions), single-node MongoDB bottleneck |

Given the 24-hour limit, the chosen approach keeps the architecture **single-service friendly** — one Node.js process, one MongoDB Atlas cluster — while still providing strict atomicity guarantees enforced at the database level. It avoids the overhead of bootstrapping and operating Redis while remaining fully correct under 100 parallel requests as proven by the load test.

---

## Tech Stack

- **Runtime**: Node.js (ESM / NodeNext modules)
- **Framework**: Express 5
- **Language**: TypeScript 7 (strict mode)
- **Database**: MongoDB via Mongoose 9
- **Dev Tools**: tsx, nodemon
