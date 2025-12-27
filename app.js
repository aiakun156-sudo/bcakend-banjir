import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend Banjir Aktif");
});

// Endpoint dari ESP32 / Frontend
app.post("/sensor", async (req, res) => {
  try {
    const data = req.body;

    // Kirim ke FastAPI
    const ml = await axios.post("http://127.0.0.1:8000/predict", data);

    res.json({
      sensor: data,
      prediction: ml.data,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.listen(4000, () => {
  console.log("Backend berjalan di http://localhost:4000");
});
