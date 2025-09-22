// server.js
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Chatbot route
app.post("/chat", (req, res) => {
  const { message } = req.body;
  if (message.toLowerCase().includes("shipment")) {
    return res.json({ reply: "📦 Shipment will arrive in 2 days." });
  }
  res.json({ reply: "🤖 I’m here to help with SCM queries." });
});

// Forecast route
app.post("/forecast", (req, res) => {
  const { productCategory, forecastPeriod } = req.body;
  const forecast = Array.from({ length: forecastPeriod }, () =>
    Math.floor(Math.random() * 1000)
  );
  res.json({
    category: productCategory,
    forecast,
    accuracy: (80 + Math.random() * 20).toFixed(2) + "%",
  });
});

app.listen(PORT, () =>
  console.log(`✅ Backend running at http://localhost:${5500}`)
);
