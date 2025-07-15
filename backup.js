// server.js
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const app = express();
const multer = require("multer");

// Configure file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(cors());
app.use(express.json());

// Database configuration
const db = new sqlite3.Database("./orders.db");

// Initialize database
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

// API Routes

// GET all orders
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
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const orders = rows.map((row) => ({
      ...row,
      items: JSON.parse(row.items),
      paymentProofUrl: row.paymentProof
        ? `${req.protocol}://${req.get("host")}/uploads/${row.paymentProof}`
        : null,
    }));

    res.json(orders);
  });
});

// POST new order with payment proof
app.post("/api/orders", upload.single("paymentProof"), (req, res) => {
  const { customerName, phoneNumber, numberOfPeople, reservationTime } =
    req.body;
  const paymentProof = req.file;

  if (!customerName || !phoneNumber || !req.body.items) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const items = JSON.parse(req.body.items);

    // Validate items structure
    const validItems =
      Array.isArray(items) &&
      items.every(
        (item) =>
          item &&
          item.name &&
          typeof item.price === "number" &&
          typeof item.quantity === "number"
      );

    if (!validItems) {
      return res.status(400).json({ error: "Invalid items format" });
    }

    if (!paymentProof) {
      return res.status(400).json({ error: "Payment proof is required" });
    }

    // Use reservationTime as the timestamp if provided, otherwise use current time
    const timestamp = reservationTime
      ? new Date(reservationTime).toISOString()
      : new Date().toISOString();

    const sql = `INSERT INTO orders (customerName, phoneNumber, numberOfPeople, items, paymentProof, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(
      sql,
      [
        customerName,
        phoneNumber,
        numberOfPeople || 1,
        JSON.stringify(items),
        paymentProof.filename,
        timestamp,
      ],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        res.status(201).json({
          id: this.lastID,
          customerName,
          phoneNumber,
          numberOfPeople: numberOfPeople || 1,
          items,
          status: "pending",
          timestamp: timestamp,
          paymentProofUrl: `/uploads/${paymentProof.filename}`,
          verified: false,
        });
      }
    );
  } catch (err) {
    return res.status(400).json({ error: "Invalid items format" });
  }
});

// UPDATE order status
app.put("/api/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (
    !status ||
    !["pending", "preparing", "ready", "completed"].includes(status)
  ) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const sql = `UPDATE orders SET status = ? WHERE id = ?`;

  db.run(sql, [status, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ success: true, message: `Order status updated to ${status}` });
  });
});

// Verify payment proof
app.put("/api/orders/:id/verify", (req, res) => {
  const { id } = req.params;
  const { verified } = req.body;

  if (typeof verified !== "boolean") {
    return res.status(400).json({ error: "Invalid verification status" });
  }

  // Only update status to 'preparing' if verifying (not when unverifying)
  const statusUpdate = verified ? ", status = 'preparing'" : "";
  const sql = `UPDATE orders SET verified = ? ${statusUpdate} WHERE id = ?`;

  db.run(sql, [verified ? 1 : 0, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      success: true,
      message: verified
        ? "Payment verified and order moved to preparing"
        : "Payment verification removed",
    });
  });
});

// DELETE completed orders
app.delete("/api/orders/completed", (req, res) => {
  const sql = `DELETE FROM orders WHERE status = 'completed'`;

  db.run(sql, function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json({
      success: true,
      message: `${this.changes} completed orders deleted`,
    });
  });
});

// Menu Routes

// GET all menu items
app.get("/api/menu", (req, res) => {
  const sql = `SELECT * FROM menu ORDER BY type, name`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const menuItems = rows.map((row) => ({
      ...row,
      imageUrl: row.imagePath
        ? `${req.protocol}://${req.get("host")}/uploads/${row.imagePath}`
        : null,
    }));

    res.json(menuItems);
  });
});

// POST new menu item
app.post("/api/menu", upload.single("image"), (req, res) => {
  const { name, type, price } = req.body;
  const image = req.file;

  if (!name || !type || !price) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const sql = `INSERT INTO menu (name, type, price, imagePath) 
               VALUES (?, ?, ?, ?)`;

  db.run(
    sql,
    [name, type, parseFloat(price), image ? image.filename : null],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        id: this.lastID,
        name,
        type,
        price: parseFloat(price),
        imageUrl: image
          ? `${req.protocol}://${req.get("host")}/uploads/${image.filename}`
          : null,
        timestamp: new Date().toISOString(),
      });
    }
  );
});

// DELETE menu item
app.delete("/api/menu/:id", (req, res) => {
  const { id } = req.params;

  // First get the menu item to delete its image file
  db.get(`SELECT imagePath FROM menu WHERE id = ?`, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    // Delete the image file if it exists
    if (row.imagePath) {
      const imagePath = path.join(__dirname, "uploads", row.imagePath);
      fs.unlink(imagePath, (err) => {
        if (err) console.error("Error deleting image:", err);
      });
    }

    // Now delete the menu item
    db.run(`DELETE FROM menu WHERE id = ?`, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({ success: true, message: "Menu item deleted" });
    });
  });
});

// Promotions Routes

// GET all promotions
app.get("/api/promotions", (req, res) => {
  const sql = `SELECT * FROM promotions ORDER BY date DESC`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const promotions = rows.map((row) => ({
      ...row,
      imageUrl: row.imagePath
        ? `${req.protocol}://${req.get("host")}/uploads/${row.imagePath}`
        : null,
    }));

    res.json(promotions);
  });
});

// POST new promotion
app.post("/api/promotions", upload.single("image"), (req, res) => {
  const { title, description, date } = req.body;
  const image = req.file;

  if (!title || !description || !date || !image) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const sql = `INSERT INTO promotions (title, description, imagePath, date) 
               VALUES (?, ?, ?, ?)`;

  db.run(sql, [title, description, image.filename, date], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.status(201).json({
      id: this.lastID,
      title,
      description,
      date,
      imageUrl: `${req.protocol}://${req.get("host")}/uploads/${
        image.filename
      }`,
      timestamp: new Date().toISOString(),
    });
  });
});

// DELETE promotion
app.delete("/api/promotions/:id", (req, res) => {
  const { id } = req.params;

  // First get the promotion to delete its image file
  db.get(`SELECT imagePath FROM promotions WHERE id = ?`, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    // Delete the image file
    if (row.imagePath) {
      const imagePath = path.join(__dirname, "uploads", row.imagePath);
      fs.unlink(imagePath, (err) => {
        if (err) console.error("Error deleting image:", err);
      });
    }

    // Now delete the promotion
    db.run(`DELETE FROM promotions WHERE id = ?`, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({ success: true, message: "Promotion deleted" });
    });
  });
});

// Root route to confirm server is running
app.get("/", (req, res) => {
  res.send("API is running.");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

