const sqlite3 = require("sqlite3").verbose();
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBagIcddt7BjkYsvC33BqDQfMzsFdjy5D0",
  authDomain: "yuanfong-84448.firebaseapp.com",
  projectId: "yuanfong-84448",
  storageBucket: "yuanfong-84448.firebasestorage.app",
  messagingSenderId: "743419868803",
  appId: "1:743419868803:web:b0c2548633927bd302cdb6",
  measurementId: "G-HCBLT09FXN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(app);

// Connect to SQLite
const dbSqlite = new sqlite3.Database("./orders.db");

dbSqlite.all("SELECT * FROM orders", async (err, rows) => {
  if (err) {
    console.error(err.message);
    return;
  }

  for (const row of rows) {
    try {
      const docRef = await addDoc(collection(dbFirestore, "orders"), {
        customerName: row.customerName,
        phoneNumber: row.phoneNumber,
        numberOfPeople: row.numberOfPeople,
        items: JSON.parse(row.items),
        status: row.status,
        timestamp: row.timestamp,
        paymentProof: row.paymentProof || null,
        verified: Boolean(row.verified)
      });

      console.log(`Order migrated: ${docRef.id}`);
    } catch (e) {
      console.error("Error adding document:", e);
    }
  }

  dbSqlite.close();
});
