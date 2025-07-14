const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");
const { readFileSync } = require("fs");

// Read JSON file
const menuData = JSON.parse(
  readFileSync(path.join(__dirname, "menu.json"), "utf8")
);

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
const db = getFirestore(app);

// Upload each category separately
const uploadMenu = async () => {
  for (const category in menuData) {
    const items = menuData[category];

    if (category === "drinks") {
        const drinkTypes = menuData[category]; // hot & cold
        for (const type in drinkTypes) {
            const colRef = collection(db, "menu", `drinks_${type}`, "items");
            for (const drink of drinkTypes[type]) {
            await addDoc(colRef, drink);
            console.log(`Uploaded ${drink.name} to drinks_${type}`);
            }
        }
        continue; // Skip rest of logic for "drinks"
    }


    // Only upload if it's an array
    if (Array.isArray(items)) {
      const colRef = collection(db, "menu", category, "items");
      for (const item of items) {
        const docData = typeof item === "object" ? item : { name: item };
        await addDoc(colRef, docData);
        console.log(`Uploaded ${docData.name || docData.code} to ${category}`);
}
    } else {
      console.log(`Skipping ${category} (not an array)`);
    }
  }
};

uploadMenu();