import express from "express";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';
import cors from "cors";
import axios from "axios";
import { sendTelegramAlert } from './telegram.js';
import { scheduleDailySummary } from './scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FASTAPI_URL = "https://noisy-madelon-aimalaka-4ae3677b.koyeb.app";

// =========================
// KONFIGURASI SUPABASE
// =========================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL dan SUPABASE_ANON_KEY harus diatur di file .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase connected');
console.log(`✅ ML API URL: ${FASTAPI_URL}`);

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// =========================
// ROUTES UTAMA
// =========================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🌊 Flood Monitoring System API",
    version: "2.0.0",
    endpoints: {
      "GET /test": "Test connection",
      "POST /api/sensor": "Receive data from ESP32",
      "GET /api/latest": "Get latest sensor data",
      "GET /api/current-status": "Get current flood status",
      "GET /api/stats": "Get system statistics",
      "GET /api/chart-data": "Get data for charts",
      "POST /api/predict": "Predict flood using ML model"
    }
  });
});

// Test endpoint
app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "🚀 Backend is working!",
    timestamp: new Date().toISOString()
  });
});

// =========================
// API ROUTES
// =========================

// API test
app.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "API is working!",
    timestamp: new Date().toISOString()
  });
});

// Endpoint untuk ESP32 - DENGAN NOTIFIKASI TELEGRAM
app.post("/api/sensor", async (req, res) => {
  console.log("📡 Received data from ESP32:", req.body);
  
  try {
    const { h_kanan, h_kiri, q_kanan, q_kiri } = req.body;

    if (!h_kanan || !h_kiri || !q_kanan || !q_kiri) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const sensorData = {
      h_kanan: parseFloat(h_kanan),
      h_kiri: parseFloat(h_kiri),
      q_kanan: parseFloat(q_kanan),
      q_kiri: parseFloat(q_kiri),
      created_at: new Date().toISOString()
    };

    console.log("📊 Saving to database...");

    const { data: insertedData, error: insertError } = await supabase
      .from("sensor_logs")
      .insert([sensorData])
      .select()
      .single();

    if (insertError) {
      console.error("❌ Database error:", insertError);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    console.log("✅ Data saved, ID:", insertedData.id);

    let mlPrediction = null;
    let shouldSendAlert = false;

    try {
      const mlResponse = await axios.post(`${FASTAPI_URL}/predict`, sensorData);
      mlPrediction = mlResponse.data;

      if (mlPrediction.status === "BANJIR" || mlPrediction.status === "BAHAYA" || mlPrediction.prediction === 1) {
        shouldSendAlert = true;
        console.log("🚨 Flood condition detected! Will send alert.");
      }

    } catch (mlError) {
      console.warn("⚠️ ML API error:", mlError.message);
      if (sensorData.h_kanan > 150 || sensorData.h_kiri > 150) {
        shouldSendAlert = true;
        mlPrediction = {
          status: "BANJIR",
          prediction: 1,
          confidence: 90,
          recommendation: "Segera evakuasi dan periksa pintu air!"
        };
        console.log("⚠️ Using manual threshold - Flood condition detected!");
      }
    }

    if (shouldSendAlert && mlPrediction) {
      console.log("📱 Sending Telegram alert...");
      const alertData = {
        ...sensorData,
        sensor_id: insertedData.id,
        prediction: mlPrediction,
        timestamp: new Date().toISOString()
      };
      try {
        const telegramResult = await sendTelegramAlert(alertData);
        if (telegramResult) console.log("✅ Telegram alert sent successfully");
        else console.warn("⚠️ Telegram alert returned false");
      } catch (telegramError) {
        console.error("❌ Failed to send Telegram alert:", telegramError.message);
      }
    }

    res.json({
      success: true,
      message: "Data received and processed",
      sensor_id: insertedData.id,
      sensor_data: sensorData,
      ml_prediction: mlPrediction,
      timestamp: new Date().toISOString(),
      alert_sent: shouldSendAlert
    });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Get latest data
app.get("/api/latest", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { data, error } = await supabase
      .from("sensor_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    res.json({ success: true, count: data?.length || 0, data: data || [] });

  } catch (error) {
    console.error("Error in /api/latest:", error);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
});

// Get current status
app.get("/api/current-status", async (req, res) => {
  try {
    const { data: readings, error: readingError } = await supabase
      .from("sensor_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (readingError) console.error("Error fetching readings:", readingError);

    const latestReading = readings?.[0] || null;
    let status = "AMAN", prediction = 0, mlData = null;

    if (latestReading) {
      try {
        const mlResponse = await axios.post(`${FASTAPI_URL}/predict`, latestReading);
        mlData = mlResponse.data;
        status = mlData.status;
        prediction = mlData.prediction;
        if (status === "BANJIR" || status === "BAHAYA" || prediction === 1) {
          console.log("🚨 Current status indicates flood!");
        }
      } catch (mlError) {
        console.warn("⚠️ ML API unavailable, using threshold:", mlError.message);
        if (latestReading.h_kanan > 150 || latestReading.h_kiri > 150) {
          status = "BANJIR";
          prediction = 1;
        }
      }
    }

    res.json({ 
      success: true, 
      status, 
      prediction, 
      last_updated: new Date().toISOString(), 
      current_reading: latestReading, 
      ml_data: mlData 
    });
  } catch (error) {
    console.error("Error in /api/current-status:", error);
    res.json({ 
      success: true, 
      status: "AMAN", 
      prediction: 0, 
      last_updated: new Date().toISOString(), 
      current_reading: null, 
      ml_data: null 
    });
  }
});

// =========================
// Get statistics
// =========================
app.get("/api/stats", async (req, res) => {
  try {
    const { data: dummy1, count: totalReadings, error: countError } = await supabase
      .from("sensor_logs")
      .select("*", { count: 'exact', head: true });

    let latestData = null;
    const { data: latestReading, error: latestError } = await supabase
      .from("sensor_logs")
      .select("h_kanan, h_kiri, created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!latestError && latestReading?.length > 0) latestData = latestReading[0];

    let floodDays = 0;
    const { data: dummy2, count, error: floodError } = await supabase
      .from("daily_summary")
      .select("*", { count: 'exact', head: true })
      .eq("status", "BANJIR");
    if (!floodError && typeof count === "number") floodDays = count;

    const safeDays = Math.max(0, (totalReadings || 0) - floodDays);

    res.json({
      success: true,
      statistics: {
        total_readings: totalReadings || 0,
        latest_reading: latestData,
        flood_days: floodDays,
        safe_days: safeDays,
        server_time: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("🔥 /api/stats error:", error);
    res.json({
      success: true,
      statistics: { 
        total_readings: 0, 
        latest_reading: null, 
        flood_days: 0, 
        safe_days: 0, 
        server_time: new Date().toISOString() 
      }
    });
  }
});

// =========================
// Get chart data
// =========================
app.get("/api/chart-data", async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const timeAgo = new Date();
    timeAgo.setHours(timeAgo.getHours() - hours);

    const { data, error } = await supabase
      .from("sensor_logs")
      .select("h_kanan, h_kiri, created_at")
      .gte("created_at", timeAgo.toISOString())
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, hours, data: data || [] });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Direct predict endpoint
app.post("/api/predict", async (req, res) => {
  try {
    const { h_kanan, h_kiri, q_kanan, q_kiri } = req.body;
    const mlResponse = await axios.post(`${FASTAPI_URL}/predict`, { h_kanan, h_kiri, q_kanan, q_kiri });
    res.json({ success: true, prediction: mlResponse.data });
  } catch (error) {
    console.error("❌ Prediction error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================
// ERROR HANDLERS
// =========================
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found", requested_url: req.url });
});

app.use((err, req, res, next) => {
  console.error("🔥 Server error:", err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// =========================
// TELEGRAM CONNECTION TEST
// =========================
(async () => {
  setTimeout(async () => {
    const testData = {
      h_kanan: 160,
      h_kiri: 155,
      q_kanan: 120,
      q_kiri: 110,
      sensor_id: "test-001",
      prediction: { status: "TEST", confidence: 95, recommendation: "This is a test message from flood monitoring system" },
      timestamp: new Date().toISOString()
    };
    try {
      await sendTelegramAlert(testData);
      console.log('✅ Telegram connection test successful');
    } catch (error) {
      console.warn('⚠️ Telegram test failed:', error.message);
    }
  }, 2000);
})();

// =========================
// START SERVER
// =========================
scheduleDailySummary();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Web Dashboard: http://localhost:5173`);
  console.log(`🤖 ML API: ${FASTAPI_URL}`);
  console.log(`📱 Telegram Alerts: ${process.env.TELEGRAM_BOT_TOKEN ? 'ENABLED' : 'DISABLED'}`);
});
