import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ERROR: Supabase credentials missing in .env");
  console.error("Add to backend/.env:");
  console.error("SUPABASE_URL=https://your-project.supabase.co");
  console.error("SUPABASE_KEY=your-anon-key");
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection on startup
(async () => {
  try {
    const { error } = await supabase.from('sensor_logs').select('count').limit(1);
    if (error) {
      console.warn("⚠️ Database connection issue:", error.message);
      console.log("📋 Please ensure tables are created (run database_final.sql)");
    } else {
      console.log("✅ Supabase connected");
    }
  } catch (error) {
    console.error("❌ Database error:", error.message);
  }
})();