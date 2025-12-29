import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import { sendTelegramAlert } from './telegram.js';

// Inisialisasi Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Generate daily summary - SIMPLE VERSION
export const generateDailySummary = async () => {
  try {
    console.log('\n📊 Generating daily summary...');
    
    // Dapatkan tanggal kemarin dalam waktu lokal server
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Format YYYY-MM-DD untuk kemarin
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    console.log(`📅 Processing data for: ${yesterdayStr}`);
    
    // Get yesterday's data (00:00:00 sampai 23:59:59)
    const { data: sensorData, error: fetchError } = await supabase
      .from('sensor_logs')
      .select('*')
      .gte('created_at', `${yesterdayStr}T00:00:00`)
      .lte('created_at', `${yesterdayStr}T23:59:59`)
      .order('created_at', { ascending: true });
    
    if (fetchError) {
      console.error('❌ Error fetching data:', fetchError.message);
      return;
    }
    
    if (!sensorData || sensorData.length === 0) {
      console.log('📭 No data for yesterday');
      return;
    }
    
    console.log(`📊 Processing ${sensorData.length} records for ${yesterdayStr}`);
    
    // Calculate statistics
    let total_h_kanan = 0;
    let total_h_kiri = 0;
    let total_q_kanan = 0;
    let total_q_kiri = 0;
    let max_h_kanan = 0;
    let max_h_kiri = 0;
    let floodCount = 0;
    
    sensorData.forEach(record => {
      const h_kanan = parseFloat(record.h_kanan);
      const h_kiri = parseFloat(record.h_kiri);
      
      total_h_kanan += h_kanan;
      total_h_kiri += h_kiri;
      total_q_kanan += parseFloat(record.q_kanan);
      total_q_kiri += parseFloat(record.q_kiri);
      
      if (h_kanan > max_h_kanan) max_h_kanan = h_kanan;
      if (h_kiri > max_h_kiri) max_h_kiri = h_kiri;
      
      // Hitung kondisi banjir
      if (h_kanan > 150 || h_kiri > 150) {
        floodCount++;
      }
    });
    
    const count = sensorData.length;
    const avg_h_kanan = count > 0 ? total_h_kanan / count : 0;
    const avg_h_kiri = count > 0 ? total_h_kiri / count : 0;
    const avg_q_kanan = count > 0 ? total_q_kanan / count : 0;
    const avg_q_kiri = count > 0 ? total_q_kiri / count : 0;
    
    // Tentukan status
    let status = "AMAN";
    let prediction = 0;
    
    if (max_h_kanan > 180 || max_h_kiri > 180) {
      status = "BAHAYA";
      prediction = 1;
    } else if (max_h_kanan > 150 || max_h_kiri > 150) {
      status = "BANJIR";
      prediction = 1;
    }
    
    // SIMPAN KE DATABASE dengan SCHEMA YANG BENAR
    const summary = {
      tanggal: yesterdayStr,  // DATE format
      avg_h_kanan: parseFloat(avg_h_kanan.toFixed(2)),
      avg_h_kiri: parseFloat(avg_h_kiri.toFixed(2)),
      avg_q_kanan: parseFloat(avg_q_kanan.toFixed(2)),
      avg_q_kiri: parseFloat(avg_q_kiri.toFixed(2)),
      count: count,
      status: status,
      prediction: prediction,  // Field dari schema
      last_status: status,     // Field dari schema
      last_prediction: prediction,  // Field dari schema
      created_at: new Date().toISOString()
    };
    
    console.log('📋 Summary to save:', summary);
    
    // Save to database - gunakan upsert
    const { data, error } = await supabase
      .from('daily_summary')
      .upsert(summary, { onConflict: 'tanggal' });
    
    if (error) {
      console.error('❌ Error saving summary:', error.message);
      return;
    }
    
    console.log(`✅ Daily summary saved for ${yesterdayStr}`);
    
    // Kirim notifikasi jika banjir
    if (status === "BANJIR" || status === "BAHAYA") {
      console.log("📱 Sending Telegram alert...");
      await sendTelegramAlert({
        h_kanan: avg_h_kanan,
        h_kiri: avg_h_kiri,
        prediction: {
          status: status,
          recommendation: `Laporan harian: ${yesterdayStr} - Status ${status}`
        },
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Failed to generate daily summary:', error);
  }
};

// Cleanup old sensor data
export const cleanupOldData = async () => {
  try {
    console.log('\n🧹 Cleaning up old data...');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { error, count } = await supabase
      .from('sensor_logs')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString());
    
    if (error) {
      console.error('❌ Error cleaning up:', error.message);
      return;
    }
    
    console.log(`🗑️ Deleted ${count} old records`);
    
  } catch (error) {
    console.error('❌ Failed to cleanup old data:', error);
  }
};

// Schedule tasks - SESUAI WIB
export const scheduleDailySummary = () => {
  console.log('⏰ Setting up schedulers...');
  
  // Jalankan jam 00:05 WIB setiap hari
  cron.schedule('5 0 * * *', generateDailySummary, {
    timezone: "Asia/Jakarta"
  });
  
  // Cleanup jam 01:00 WIB setiap hari
  cron.schedule('0 1 * * *', cleanupOldData, {
    timezone: "Asia/Jakarta"
  });
  
  console.log('✅ Schedulers activated (00:05 & 01:00 WIB)');
  
  // Test run saat startup
  setTimeout(() => {
    console.log('🔧 Running initial test...');
    generateDailySummary();
  }, 3000);
};
