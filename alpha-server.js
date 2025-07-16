const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const multer = require("multer");


// 🔐 Load Firebase service account
const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const firestoreDb = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// ⚙️ Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// 🔗 Static middleware
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 🗃️ SQLite database setup
const db = new sqlite3.Database("./orders.db");
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      phoneNumber TEXT NOT NULL,
      numberOfPeople INTEGER DEFAULT 1,
      items TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      paymentProof TEXT,
      verified BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      imagePath TEXT NOT NULL,
      date TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      imagePath TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// 📥 Submit new order
app.post("/api/orders", upload.single("paymentProof"), (req, res) => {
  const { customerName, phoneNumber, numberOfPeople, reservationTime } = req.body;
  const paymentProof = req.file;

  if (!customerName || !phoneNumber || !req.body.items) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const items = JSON.parse(req.body.items);
    const validItems = Array.isArray(items) &&
      items.every(item => item.name && typeof item.price === "number" && typeof item.quantity === "number");

    if (!validItems) return res.status(400).json({ error: "Invalid items format" });
    if (!paymentProof) return res.status(400).json({ error: "Payment proof is required" });

    const timestamp = reservationTime ? new Date(reservationTime).toISOString() : new Date().toISOString();
    const sql = `
      INSERT INTO orders (customerName, phoneNumber, numberOfPeople, items, paymentProof, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      customerName,
      phoneNumber,
      numberOfPeople || 1,
      JSON.stringify(items),
      paymentProof.filename,
      timestamp
    ], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.status(201).json({
        id: this.lastID,
        customerName,
        phoneNumber,
        numberOfPeople: numberOfPeople || 1,
        items,
        status: "pending",
        timestamp,
        paymentProofUrl: `/uploads/${paymentProof.filename}`,
        verified: false,
      });
    });
  } catch (err) {
    return res.status(400).json({ error: "Invalid items format" });
  }
});

// 📦 Get all orders (sorted by status and timestamp)
app.get("/api/orders", (req, res) => {
  const sql = `SELECT * FROM orders ORDER BY 
    CASE 
      WHEN status = 'pending' THEN 1
      WHEN status = 'preparing' THEN 2
      WHEN status = 'ready' THEN 3
      WHEN status = 'completed' THEN 4
      ELSE 5
    END, 
    timestamp DESC`;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const orders = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items),
      paymentProofUrl: row.paymentProof
        ? `${req.protocol}://${req.get("host")}/uploads/${row.paymentProof}`
        : null,
    }));

    res.json(orders);
  });
});

// 🔁 Update order status
app.put("/api/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !["pending", "preparing", "ready", "completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Order not found" });

    res.json({ success: true, message: `Order status updated to ${status}` });
  });
});

// ✅ Verify payment proof
app.put("/api/orders/:id/verify", (req, res) => {
  const { id } = req.params;
  const { verified } = req.body;

  if (typeof verified !== "boolean") {
    return res.status(400).json({ error: "Invalid verification status" });
  }

  const statusUpdate = verified ? ", status = 'preparing'" : "";
  const sql = `UPDATE orders SET verified = ? ${statusUpdate} WHERE id = ?`;

  db.run(sql, [verified ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Order not found" });

    res.json({
      success: true,
      message: verified
        ? "Payment verified and order moved to preparing"
        : "Payment verification removed",
    });
  });
});

// 🧹 Delete completed orders
app.delete("/api/orders/completed", (req, res) => {
  db.run(`DELETE FROM orders WHERE status = 'completed'`, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: `${this.changes} completed orders deleted` });
  });
});

// ☁️ Upload completed orders to Firestore
app.post("/api/upload-completed-orders", (req, res) => {
  const sql = "SELECT * FROM orders WHERE status = 'completed'";

  db.all(sql, async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.json({ success: true, message: "No completed orders to upload." });

    let uploadedCount = 0;

    for (const row of rows) {
      try {
        await firestoreDb.collection("completed_orders").add({
          customerName: row.customerName,
          phoneNumber: row.phoneNumber,
          numberOfPeople: row.numberOfPeople,
          items: JSON.parse(row.items),
          status: row.status,
          timestamp: row.timestamp,
          paymentProof: row.paymentProof || null,
          verified: Boolean(row.verified)
        });
        uploadedCount++;
      } catch (e) {
        console.error("❌ Firestore upload error:", e.message);
      }
    }

    res.json({
      success: true,
      message: `✅ Uploaded ${uploadedCount} completed orders to Firebase`
    });

    // 🧼 Optional: Clear uploaded orders
    db.run("DELETE FROM orders WHERE status='completed'", () =>
      console.log("🗑️ Cleared completed orders from SQLite after upload")
    );
  });
});

// 🌐 Root route
app.get("/", (req, res) => {
  res.send("API is running.");
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
