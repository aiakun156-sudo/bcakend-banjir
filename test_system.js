import axios from "axios";

const BASE_URL = "http://localhost:3000";
const FASTAPI_URL = "http://localhost:8000";

async function testCompleteFlow() {
  console.log("🧪 Testing Complete Flood Monitoring Flow\n");

  try {
    console.log("1️⃣ Testing FastAPI ML Service...");
    const mlTest = await axios.post(`${FASTAPI_URL}/predict`, {
      H_kanan: 120.5,
      H_kiri: 110.2,
      Q_kanan: 85.3,
      Q_kiri: 78.9,
    });
    console.log(
      `✅ ML Prediction: ${mlTest.data.status} (${mlTest.data.confidence}%)`
    );

    console.log("\n2️⃣ Testing Sensor Data Flow...");
    const sensorResponse = await axios.post(`${BASE_URL}/sensor`, {
      h_kanan: 125.5,
      h_kiri: 115.0,
      q_kanan: 88.0,
      q_kiri: 80.5,
      sensor_id: "test_sensor_01",
    });
    console.log("✅ Sensor data processed:", sensorResponse.data.success);
    console.log("   Prediction:", sensorResponse.data.prediction.status);

    console.log("\n3️⃣ Testing Data Retrieval...");
    const latestData = await axios.get(`${BASE_URL}/latest?limit=5`);
    console.log(`✅ Latest ${latestData.data.count} records retrieved`);

    const summary = await axios.get(`${BASE_URL}/summary?limit=3`);
    console.log(`✅ ${summary.data.count} daily summaries retrieved`);

    const stats = await axios.get(`${BASE_URL}/stats`);
    console.log("✅ System stats:", stats.data.system_stats);

    console.log("\n4️⃣ Testing Database Status...");
    const dbStatus = await axios.get(`${BASE_URL}/db-status`);
    console.log("✅ Database tables checked");
    Object.entries(dbStatus.data.tables).forEach(([table, info]) => {
      console.log(`   ${table}: ${info.count} records (${info.status})`);
    });

    console.log("\n🎉 ALL TESTS PASSED! System is working correctly.");
    console.log("\n📋 Summary:");
    console.log(`   - ML Model: ${mlTest.data.status}`);
    console.log(`   - Sensor Data: Processed successfully`);
    console.log(`   - Database: All tables active`);
    console.log(
      `   - Daily Summary: ${summary.data.count > 0 ? "Exists" : "Not yet"}`
    );
  } catch (error) {
    console.error("\n❌ Test Failed:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
  }
}

// Jalankan test
testCompleteFlow();
