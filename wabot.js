const dependencies = [
  "@whiskeysockets/baileys",
  "fluent-ffmpeg",
  "pino",
  "axios",
  "btch-downloader", 
  "qs",
  "mime-types",
  "instagram-private-api",
  "cheerio", 
  "file-type",
  "form-data" 
];

const { execSync } = require("child_process");
const fs = require('fs');

console.log("🚀 Memeriksa dan menginstal dependensi...");
for (const dep of dependencies) {
  try {
    require.resolve(dep);
  } catch {
    console.log(`📦 Menginstal: ${dep}...`);
    execSync(`npm install ${dep} --silent`, { stdio: "inherit" });
  }
}

// Imports
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  getContentType,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");
const qs = require("qs");
const cheerio = require("cheerio");
const { fbdown, twitter, pinterest, youtube } = require("btch-downloader");
const path = require("path");
const https = require("https");
const readline = require("readline");
const mime = require('mime-types');
const { IgApiClient } = require('instagram-private-api');
const ffmpeg = require('fluent-ffmpeg');
const FormData = require('form-data');
const fileType = require("file-type");

const IG_USERNAME = 'tiger.4148083'; 
const IG_PASSWORD = '#Dimas094';

const ig = new IgApiClient();

// --- FUNGSI LOGIN & SAVE SESSION INSTAGRAM ---
async function loginInstagram() {
  ig.state.generateDevice(IG_USERNAME);

  if (fs.existsSync('ig_state.json')) {
    try {
      await ig.state.deserialize(JSON.parse(fs.readFileSync('ig_state.json', 'utf8')));
      console.log('✅ [IG Internal] Berhasil load session.');
      return;
    } catch (e) {
      console.log('⚠️ [IG Internal] Session invalid, login ulang...');
    }
  }

  try {
    console.log('🔄 [IG Internal] Sedang login...');
    const loggedInUser = await ig.account.login(IG_USERNAME, IG_PASSWORD);
    const serialized = await ig.state.serialize();
    delete serialized.constants;
    fs.writeFileSync('ig_state.json', JSON.stringify(serialized));
    console.log(`✅ [IG Internal] Login Sukses sebagai ${loggedInUser.username}`);
  } catch (e) {
    if (e.message.includes('checkpoint')) {
        console.error(`❌ [IG Internal] Akun terkena CHECKPOINT! Silakan login manual di HP atau ganti akun.`);
    } else {
        console.error(`❌ [IG Internal] Gagal Login: ${e.message}`);
    }
  }
}

// =================== 2. CONFIG & CLIENT ===================
const config = {
  sessionName: "session",
  pairingTimeout: 60000,
  downloadPath: "./downloads",
  botName: "KenZx Bot"
};

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

if (!fs.existsSync(config.downloadPath)) fs.mkdirSync(config.downloadPath, { recursive: true });

const client = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

// =================== 3. HELPER FUNCTIONS ===================

const getWIBTime = () => {
  const options = {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  return new Date().toLocaleString("id-ID", options) + " WIB";
};

// 1. Fungsi Konversi ke MP3
const toAudio = (buffer, ext) => {
  return new Promise((resolve, reject) => {
    const tmpInput = path.join(config.downloadPath, `${Date.now()}.${ext}`);
    const tmpOutput = path.join(config.downloadPath, `${Date.now()}.mp3`);
    
    fs.writeFileSync(tmpInput, buffer);
    
    ffmpeg(tmpInput)
      .toFormat('mp3')
      .on('end', () => {
        const buff = fs.readFileSync(tmpOutput);
        fs.unlinkSync(tmpInput);
        fs.unlinkSync(tmpOutput);
        resolve(buff);
      })
      .on('error', (err) => {
        if(fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
        reject(err);
      })
      .save(tmpOutput);
  });
};

// 2. Fungsi Membuat Sticker (Image/Video to WebP)
const createSticker = (buffer, isVideo = false) => {
  return new Promise((resolve, reject) => {
    const tmpInput = path.join(config.downloadPath, `${Date.now()}.${isVideo ? 'mp4' : 'png'}`);
    const tmpOutput = path.join(config.downloadPath, `${Date.now()}.webp`);
    
    fs.writeFileSync(tmpInput, buffer);

    const inputOptions = isVideo ? ['-y', '-t 10'] : ['-y']; 
    
    ffmpeg(tmpInput)
      .inputOptions(inputOptions)
      .on('error', (err) => {
        if(fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
        reject(err);
      })
      .on('end', () => {
        const buff = fs.readFileSync(tmpOutput);
        fs.unlinkSync(tmpInput);
        fs.unlinkSync(tmpOutput);
        resolve(buff);
      })
      .addOutputOptions([
        '-vcodec', 'libwebp',
        '-vf', 'scale=\'min(320,iw)\':min\'(320,ih)\':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse',
        '-loop', '0',
        '-ss', '00:00:00',
        '-t', '00:00:10',
        '-preset', 'default',
        '-an',
        '-vsync', '0'
      ])
      .toFormat('webp')
      .save(tmpOutput);
  });
};

// =======================================================
//   👇 TIMPA FUNGSI uploadFile & reminiImage DENGAN INI 👇
// =======================================================

// A. Fungsi Upload ke ImgBB (Paling Stabil untuk Bot)
const uploadFile = async (buffer) => {
  try {
    // 🔑 API KEY GRATIS (Ini key publik, kalau limit habis, daftar di imgbb.com gratis)
    // Ganti string di bawah ini dengan API KEY kamu sendiri jika mau lebih awet
    const IMGBB_KEY = 'bd279d860f2771f76cd81fca8386dac3'; 

    console.log("⬆️ Uploading to ImgBB...");
    
    const form = new FormData();
    form.append('image', buffer.toString('base64')); // ImgBB butuh Base64, bukan raw buffer

    // Request ke API ImgBB
    const { data } = await axios.post(`https://api.imgbb.com/1/upload?expiration=600&key=${IMGBB_KEY}`, form, {
      headers: { ...form.getHeaders() }
    });

    if (data.data && data.data.url) {
      console.log(`✅ Upload Sukses: ${data.data.url}`);
      return data.data.url;
    } else {
      throw new Error("Respon ImgBB tidak valid.");
    }

  } catch (e) {
    // BACKUP: Jika ImgBB limit/error, lari ke Tmpfiles (Mirip ImgBB tapi tanpa Key)
    console.log(`⚠️ ImgBB Gagal (${e.message}), mencoba backup Tmpfiles...`);
    try {
        const { ext } = await require("file-type").fromBuffer(buffer);
        const form2 = new FormData();
        form2.append('file', buffer, { filename: `file.${ext}` });
        
        const { data: tmpData } = await axios.post('https://tmpfiles.org/api/v1/upload', form2, {
            headers: form2.getHeaders()
        });
        
        // Tmpfiles butuh sedikit trik URL (ganti /org/ jadi /org/dl/)
        if (tmpData && tmpData.status === 'success') {
             const originalUrl = tmpData.data.url;
             const directUrl = originalUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
             console.log(`✅ Upload Tmpfiles Sukses`);
             return directUrl;
        }
    } catch (err2) {
        throw new Error("Gagal upload ke ImgBB dan Server Backup.");
    }
    throw new Error("Gagal upload gambar.");
  }
};

const processingHDLocal = (buffer) => {
  return new Promise((resolve, reject) => {
    // Tentukan path download (sesuaikan dengan variabel config Anda)
    const downloadDir = (typeof config !== 'undefined' && config.downloadPath) ? config.downloadPath : './';
    const randomId = Math.floor(Math.random() * 999999);
    const tmpInput = path.join(downloadDir, `${randomId}_in.jpg`);
    const tmpOutput = path.join(downloadDir, `${randomId}_hd_ffmpeg.jpg`);

    fs.writeFileSync(tmpInput, buffer);

    ffmpeg(tmpInput)
      .outputOptions([
        // Filter Chain:
        // 1. scale=iw*2:ih*2 : Perbesar gambar 2x lipat
        // 2. flags=lanczos   : Algoritma scaling terbaik di FFmpeg (tajam)
        // 3. unsharp=...     : Efek menajamkan detail (Unsharp Mask)
        // 4. eq=contrast=1.1 : Sedikit menaikkan kontras agar lebih "HD"
        '-vf', 'scale=iw*2:ih*2:flags=lanczos,unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.1:saturation=1.2',
        '-vframes', '1',  // Pastikan hanya 1 frame output
        '-q:v', '2'       // Kualitas JPG tinggi
      ])
      .save(tmpOutput)
      .on('end', () => {
        if (fs.existsSync(tmpOutput)) {
          const result = fs.readFileSync(tmpOutput);
          fs.unlinkSync(tmpInput);
          fs.unlinkSync(tmpOutput);
          resolve(result);
        } else {
          reject(new Error("Gagal proses FFmpeg Local."));
        }
      })
      .on('error', (err) => {
        if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
        if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
        reject(err);
      });
  });
};


// =======================================================
//   2. FUNGSI UTAMA (API + Fallback FFmpeg)
// =======================================================

const reminiImage = async (url) => {
  try {
    console.log("⚙️ Semua API AI Down. Beralih ke mode Manual (FFmpeg Upscaler)...");
    
    // Download dulu gambar aslinya ke buffer
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const originalBuffer = Buffer.from(response.data);
    
    // Proses pakai FFmpeg
    const hdBuffer = await processingHDLocal(originalBuffer);
    console.log("✅ HD via FFmpeg Local Berhasil");
    return hdBuffer;
    
  } catch (e) {
    console.error("FFmpeg Error:", e);
    throw new Error("Gagal melakukan HD (Baik API maupun FFmpeg gagal).");
  }
};

// 4. Remove Background (Tetap sama seperti sebelumnya)
const removeBgApi = async (url) => {
  const apiKey = 'AG2USegyzE7AhVcXGyVD9kek'; 
  try {
    console.log("✂️ Memproses Remove BG via Official API...");
    const response = await axios.post(
      'https://api.remove.bg/v1.0/removebg',
      { image_url: url, size: 'auto' },
      { headers: { 'X-Api-Key': apiKey }, responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data);
  } catch (e) {
    throw new Error("Gagal Remove BG. Cek kuota API atau url gambar.");
  }
};

// 5. Add Background Color (PERBAIKAN FFmpeg)
const addBackgroundColor = (buffer, colorName) => {
  return new Promise((resolve, reject) => {
    const downloadDir = (typeof config !== 'undefined' && config.downloadPath) ? config.downloadPath : './';
    const randomId = Math.floor(Math.random() * 99999);
    const tmpInput = path.join(downloadDir, `${randomId}_nobg.png`);
    const tmpOutput = path.join(downloadDir, `${randomId}_colored.jpg`);

    // Validasi Warna: Jika user mengetik 'berwarna' atau kosong, ganti jadi warna random atau default
    let finalColor = colorName;
    const validHex = /^#[0-9A-F]{6}$/i.test(colorName);
    const validColors = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'pink', 'purple', 'orange', 'cyan'];
    
    // Jika input bukan hex dan bukan nama warna inggris umum, pakai default (misal: White)
    if (!validHex && !validColors.includes(colorName)) {
        console.log(`⚠️ Warna '${colorName}' tidak dikenali FFmpeg. Menggunakan default 'white'.`);
        finalColor = 'white'; 
    }

    fs.writeFileSync(tmpInput, buffer);

    ffmpeg(tmpInput)
      .complexFilter([
        `color=${finalColor}[bg]`,      // Buat background warna
        `[bg][0:v]scale2ref[bg][fg]`,   // Samakan ukuran background dengan input gambar
        `[bg][fg]overlay=format=auto`   // Tumpuk gambar di atas background
      ])
      .outputOptions([
        '-vframes 1',                   // PENTING: Paksa output cuma 1 frame (mencegah loop error 234)
        '-q:v 2'                        // Kualitas JPG tinggi
      ])
      .on('end', () => {
        if (fs.existsSync(tmpOutput)) {
            const buff = fs.readFileSync(tmpOutput);
            fs.unlinkSync(tmpInput);
            fs.unlinkSync(tmpOutput);
            resolve(buff);
        } else {
            reject(new Error("Gagal mewarnai background (Output tidak ditemukan)."));
        }
      })
      .on('error', (err) => {
        // Hapus file temp jika error
        if(fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
        if(fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
        console.error("FFmpeg Error:", err.message);
        reject(new Error("Gagal mewarnai. Pastikan nama warna pakai B.Inggris (ex: .bg red)"));
      })
      .save(tmpOutput);
  });
};
// =================== 4. THE ENGINES (SCRAPERS) ===================
const Engine = {
  // 🎵 TikTok (UPDATE: Prioritas HD)
  tiktok: async (url) => {
    try {
      const { data } = await client.post('https://www.tikwm.com/api/', qs.stringify({ url: url }));
      if (!data.data) throw new Error("Konten TikTok tidak ditemukan/Privat");
      
      const res = data.data;
      
      // Cek Slide
      if (res.images && res.images.length > 0) {
        return { type: 'slide', urls: res.images, title: res.title, author: res.author?.nickname };
      }

      // Prioritas ambil 'hdplay', jika tidak ada ambil 'play'
      const videoUrl = res.hdplay ? res.hdplay : res.play;
      const quality = res.hdplay ? "HD" : "SD";

      return { 
          url: videoUrl, 
          title: `[${quality}] ${res.title}`, 
          type: "video" 
      };
    } catch (e) { throw new Error(`TikTok Error: ${e.message}`); }
  },

  // 📸 Instagram
  instagram: async (url) => {
    const cleanUrl = url.replace("m.instagram.com", "www.instagram.com").split("?")[0].replace(/\/$/, "");
    console.log(`\n🔍 Processing URL: ${cleanUrl}`);

    try {
      let mediaId = null;
      const storyMatch = cleanUrl.match(/stories\/[^\/]+\/(\d+)/);
      
      if (storyMatch && storyMatch[1]) {
        mediaId = storyMatch[1]; 
      } else {
        const postMatch = cleanUrl.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
        if (postMatch && postMatch[1]) {
          const shortcode = postMatch[1];
          let id = 0n;
          const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          for (let c of shortcode) {
             id = (id * 64n) + BigInt(alphabet.indexOf(c));
          }
          mediaId = id.toString();
        }
      }

      if (mediaId) {
        const info = await ig.media.info(mediaId);
        const item = info.items[0];
        let result = { title: "Instagram Media", type: "image", url: "", media: [] };
        result.title = item.caption ? item.caption.text : "Instagram Post";

        if (item.carousel_media) {
           result.type = "carousel"; // Internal marker, nanti dihandle sebagai 'slide'
           item.carousel_media.forEach(m => {
             result.media.push(m.video_versions ? m.video_versions[0].url : m.image_versions2.candidates[0].url);
           });
           // Ubah format agar sesuai downloader
           return { type: 'slide', urls: result.media, title: result.title };
        } else if (item.video_versions) {
           return { type: "video", url: item.video_versions[0].url, title: result.title };
        } else {
           return { type: "image", url: item.image_versions2.candidates[0].url, title: result.title };
        }
      }
    } catch (e) {
      console.log(`⚠️ Internal API Gagal, beralih ke External...`);
    }

    try {
      const { data } = await axios.get(`https://vkrbot.online/api/igdl?url=${cleanUrl}`);
      if (data?.data && data.data.length > 0) {
        const media = data.data[0];
        return {
          url: media.url,
          title: "Instagram (Vkrbot)",
          type: (media.url.includes(".mp4") || media.type === "video") ? "video" : "image"
        };
      }
    } catch (e) { console.log("Server 1 Gagal."); }

    try {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${cleanUrl}`);
      if (data?.data && data.data.length > 0) {
        const media = data.data[0];
        return {
          url: media.url,
          title: "Instagram (Siput)",
          type: media.url.includes(".mp4") ? "video" : "image"
        };
      }
    } catch (e) {
      throw new Error("Gagal scrape data Instagram.");
    }
  },
  
  // 🎬 CapCut Downloader (Direct Scrape - Fix tv2 & Template)
  capcut: async (url) => {
    try {
      // 1. Handle Redirect Link (tv2 -> template-detail)
      // CapCut sering pakai link pendek, kita harus cari link aslinya dulu
      if (url.includes('tv2')) {
          try {
            const { request } = await client.get(url, { maxRedirects: 0, validateStatus: (status) => status >= 200 && status < 400 });
            // Biasanya axios akan otomatis redirect, tapi untuk link tertentu kita butuh url finalnya
            url = request.res.responseUrl || url; 
          } catch (e) {
            // Jika error karena redirect (302), ambil header location
            if (e.request && e.request.res && e.request.res.responseUrl) {
                url = e.request.res.responseUrl;
            }
          }
      }

      // 2. Ambil Source Code Halaman
      const { data } = await client.get(url, {
         headers: {
             'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
         }
      });

      // 3. Parsing HTML dengan Cheerio
      const $ = cheerio.load(data);
      
      // Prioritas 1: Cari di tag <video> atau <meta> (Paling umum)
      let videoUrl = $('video').attr('src') || 
                     $('meta[property="og:video"]').attr('content') || 
                     $('meta[property="og:video:secure_url"]').attr('content');

      // Prioritas 2: Cari via Regex (Jika tag disembunyikan)
      if (!videoUrl) {
          // Pola regex untuk mencari URL video di dalam script CapCut
          const pattern1 = /"originalUrl":"(https?:\/\/[^"]+)"/;
          const pattern2 = /"video_url":"(https?:\/\/[^"]+)"/;
          const pattern3 = /https:\/\/[\w-]+\.googlevideo\.com\/[^"']+/; // Kadang hosted di Google
          
          const match = data.match(pattern1) || data.match(pattern2) || data.match(pattern3);
          
          if (match) {
              videoUrl = match[1] || match[0];
              // Bersihkan URL dari format Unicode escape (contoh: \u002F -> /)
              videoUrl = videoUrl.replace(/\\u002F/g, "/");
          }
      }

      if (!videoUrl) throw new Error("Video source tidak ditemukan.");

      const title = $('title').text().replace('| CapCut', '').trim() || "CapCut Template";

      return {
          url: videoUrl,
          title: title,
          type: "video"
      };

    } catch (e) {
       // Opsi Terakhir: Coba API Backup (Agatz) jika scrape manual gagal total
       try {
           console.log("⚠️ Scrape manual gagal, mencoba API backup...");
           const { data } = await axios.get(`https://api.agatz.xyz/api/capcut?url=${url}`);
           if(data.status == 200 && data.data) {
               return {
                   url: data.data.video,
                   title: data.data.title || "CapCut Video",
                   type: "video"
               }
           }
       } catch (err2) {
           // Abaikan error backup
       }
       throw new Error(`CapCut Gagal: ${e.message}`);
    }
  },

  // 📘 Facebook
  facebook: async (url) => {
    try {
      const data = await fbdown(url);
      if (!data) throw new Error("Data tidak ditemukan");
      const videoUrl = data.HD || data.SD || data.Normal_video;
      if (videoUrl) return { url: videoUrl, title: "Facebook Video", type: "video" };
    } catch (e) { throw new Error("Video FB tidak ditemukan/Private."); }
  },

  // 📺 YouTube
  youtube: async (url) => {
    try {
      const data = await youtube(url);
      if (!data || !data.mp4) throw new Error("Gagal mengambil data YouTube");
      return { url: data.mp4, title: data.title || "YouTube Video", type: "video" };
    } catch (e) { throw new Error(`YouTube Error: ${e.message}`); }
  },

  // 🐦 Twitter / X
  twitter: async (url) => {
    try {
      const data = await twitter(url);
      if (!data || !data.url) throw new Error("Video Twitter tidak ditemukan");
      const videoUrl = data.url.find(v => v.quality === 'hd')?.url || data.url[0].url;
      return { url: videoUrl, title: "Twitter Video", type: "video" };
    } catch (e) { throw new Error(`Twitter Error: ${e.message}`); }
  },

  // 📌 Pinterest
  pinterest: async (url) => {
    try {
      const data = await pinterest(url);
      if (!data || !data.url) throw new Error("Media Pinterest tidak ditemukan");
      const isVideo = data.url.endsWith(".mp4") || url.includes("video");
      return { url: data.url, title: "Pinterest Media", type: isVideo ? "video" : "image" };
    } catch (e) { throw new Error(`Pinterest Error: ${e.message}`); }
  },
  
  // 🔞 Eporner (Fix 403 & Regex)
  eporner: async (url) => {
    try {
      // 1. Request dengan Headers Browser Asli (Bypass 403)
      const { data } = await client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.eporner.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        }
      });
      
      // 2. Cari link MP4 menggunakan Regex (lebih ampuh daripada Cheerio untuk script)
      // Eporner biasanya format linknya: https://.../xx_360p.mp4
      const allMatches = data.match(/https?:\/\/[^\s"']+\.mp4/g);
      
      if (!allMatches || allMatches.length === 0) throw new Error("Video tidak ditemukan (Mungkin Premium/Removed).");

      // 3. Filter: Prioritaskan 360p/480p (Cuplikan Ringan)
      // Hapus duplikat dulu
      const uniqueLinks = [...new Set(allMatches)];
      
      let videoUrl = uniqueLinks.find(link => link.includes("360p")) || 
                     uniqueLinks.find(link => link.includes("480p")) || 
                     uniqueLinks.find(link => link.includes("720p")) || 
                     uniqueLinks[0]; // Ambil apa saja jika tidak ada label kualitas

      const $ = cheerio.load(data);
      const title = $('title').text().replace("- EPORNER", "").trim();

      return {
        url: videoUrl,
        title: title || "Eporner Video",
        type: "video"
      };
    } catch (e) { 
        // Cek jika errornya 403 spesifik
        if (e.response && e.response.status === 403) {
            throw new Error("Akses Ditolak (403). Server memblokir bot.");
        }
        throw new Error(`Eporner Gagal: ${e.message}`); 
    }
  },

  // 🔞 Videqx (Fix Video Not Found)
  videqx: async (url) => {
    try {
      // 1. Request dengan Headers & Referer yang benar
      const { data } = await client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://videqx.de/', // Referer wajib sama dengan domain
        }
      });

      // 2. Teknik Regex Global: Cari string apapun yang berakhiran .mp4 di seluruh source code
      // Karena Videqx sering menyembunyikan link di dalam tag <script> var video = "..."
      const match = data.match(/https?:\/\/[^\s"']+\.mp4/);
      
      if (!match) {
           // Coba cari di tag source standar via Cheerio sebagai cadangan
           const $ = cheerio.load(data);
           const src = $('source').attr('src') || $('video').attr('src');
           if (src) return { url: src, title: $('title').text().trim(), type: "video" };
           
           throw new Error("Link MP4 tidak ditemukan di source code.");
      }

      const videoUrl = match[0];
      const $ = cheerio.load(data);
      
      return {
        url: videoUrl,
        title: $('title').text().trim() || "Videqx Video",
        type: "video"
      };
    } catch (e) { 
       throw new Error(`Videqx Gagal: ${e.message}`); 
    }
  },

  // 📁 Mediafire
  mediafire: async (url) => {
    try {
      const { data } = await client.get(url);
      const $ = cheerio.load(data);
      const link = $('a#downloadButton').attr('href');
      const name = link.split('/').pop();
      const ext = name.split('.').pop();
      if (!link) throw new Error("Link download tidak ditemukan.");
      return { url: link, title: name, type: "document", extension: ext };
    } catch (e) { throw new Error(`Mediafire Error: ${e.message}`); }
  },

  // ☁️ Terabox
  terabox: async (url) => {
    try {
        const apiUrl = `https://terabox-dl.qtcloud.workers.dev/api/get-info?shorturl=${url.split('/').pop()}&pwd=`;
        const { data } = await client.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        if (!data || !data.list || data.list.length === 0) throw new Error("File tidak ditemukan.");
        const file = data.list[0];
        return { url: file.dlink, title: file.filename, type: "document", extension: file.filename.split('.').pop() };
    } catch (e) { throw new Error("Terabox Gagal."); }
  },
};

// =================== 5. DOWNLOAD MANAGER ===================

async function downloadAndSave(data) {
  if (!data.url) throw new Error("URL tidak valid.");
  if (data.url.startsWith("//")) data.url = "https:" + data.url;

  let ext = "bin";
  if (data.type === "video") ext = "mp4";
  else if (data.type === "image") ext = "jpg";
  else if (data.extension) ext = data.extension; 
  
  const response = await client({ url: data.url, method: 'GET', responseType: 'stream' });

  if (ext === "bin" || !ext) {
      const contentType = response.headers['content-type'];
      ext = mime.extension(contentType) || "bin";
  }

  const filename = `${Date.now()}.${ext}`;
  const filePath = path.join(config.downloadPath, filename);
  const writer = fs.createWriteStream(filePath);
  
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => { 
        resolve({ 
            filePath, 
            ...data, 
            mimetype: response.headers['content-type'] 
        }); 
    });
    writer.on('error', reject);
  });
}

// =================== 6. MAIN BOT LOGIC ===================

async function startBot() {
    console.clear();
    console.log("🚀 STARTING KENZX BOT...");
    
    if (!fs.existsSync(config.sessionName)) fs.mkdirSync(config.sessionName, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false
    });
    
    const usePairingCode = true; 
    
    if (usePairingCode && !sock.authState.creds.registered) {
        console.clear();
        console.log("⚡ PAIRING ASSISTANT");
        const phone = await question("   📞 Masukkan Nomor HP (Contoh: +62xxxxx) : ");
        console.log("\n   ⚡  Requesting Pairing Code...");
        try {
            const code = await sock.requestPairingCode(phone.replace(/\D/g, ""));
            const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
            console.log(`✅ KODE: ${formattedCode}`);
        } catch (err) {
            console.log("❌ Gagal Pairing:", err.message);
        }
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") console.log("✅ BOT ONLINE! Siap digunakan.");
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startBot();
            else process.exit(1);
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const jid = m.key.remoteJid;
        const type = getContentType(m.message);
        const text = type === 'conversation' ? m.message.conversation : 
                     type === 'extendedTextMessage' ? m.message.extendedTextMessage.text : "";

        if (!text) return;
        const cmd = text.trim().toLowerCase();

        // === COMMAND: MENU ===
if (['menu', '.menu', 'help', 'start', 'hi'].includes(cmd)) {
    
    // 1. Setup Data Pengguna
    // Deteksi siapa pengirimnya (apakah di grup atau chat pribadi)
    const sender = m.key.participant || m.key.remoteJid; 
    const pushName = m.pushName || "User";

    // 3. Setup Waktu (Moment Timezone)
    const moment = require('moment-timezone');
    const timeWib = moment().tz("Asia/Jakarta").format("HH:mm:ss");
    const dateWib = moment().tz("Asia/Jakarta").locale('id').format("dddd, LL");
    
    // 4. Logic Ucapan Salam
    const hour = moment().tz("Asia/Jakarta").format("HH");
    let greeting = "Malam";
    if (hour < 4) greeting = "Malam";
    else if (hour < 11) greeting = "Pagi";
    else if (hour < 15) greeting = "Siang";
    else if (hour < 19) greeting = "Sore";

    // 5. Susun Teks Menu
    const menuText = `
╭───「 🇮🇩 *KENZO - BOT* 」
│
│ 👋 *Hallo, Selamat ${greeting}*
│
│ 👤 *Nama*   : ${pushName}
│ 📅 *Tanggal* :${dateWib}
│ ⌚ *Jam* : ${timeWib} WIB
╰─────────────────────

╭──「 *📥 SUPPORT LINK* 」
│ ◦ *Tiktok* 
│ ◦ *YouTube*
│ ◦ *Instagram* 
│ ◦ *Facebook* 
│ ◦ *X/Twitter* 
╰─────────────────────

╭──「 *🎵 CONVERTER* 」
│ ◦ *.mp3* <link video/reply video>
│   └ _Ubah video menjadi audio_
╰─────────────────────

╭──「 *📸 TOOLS & AI* 」
│ ◦ *.hd* (Reply Foto)
│   └ _Jernihkan foto burik jadi HD (AI)_ 
│ ◦ *.bg* (Reply Foto)
│   └ _Hapus background otomatis_
│ ◦ *.bg red* (Reply Foto)
│   └ _Ganti background jadi merah/biru/dll_
│ ◦ *.stc* (Reply Foto/Video)
│   └ _Buat stiker WhatsApp_
╰─────────────────────

_Note: Jika bot tidak merespon, berarti server sedang sibuk/tidur._
`.trim();

    // 6. Kirim Pesan (Gambar + Caption)
    // Menggunakan { url: ppUrl } agar gambar diambil dari link profil
    await sock.sendMessage(jid, { 
        caption: menuText 
    }, { quoted: m });
    
    return;
}

         // === COMMAND: GIFT / GIF (.gift) ===
        // Fitur: Mengubah Gambar/Video menjadi GIF Playback di WA
        if (cmd.startsWith('.gift') || cmd.startsWith('.gif')) {
            try {
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                const captionText = text.split(' ').slice(1).join(' '); // Ambil text setelah command
                
                if (!quoted) return sock.sendMessage(jid, { text: "⚠️ Reply Gambar atau Video dengan caption .gift" }, { quoted: m });

                const mime = Object.keys(quoted)[0];
                const isImage = mime === 'imageMessage';
                const isVideo = mime === 'videoMessage';

                if (!isImage && !isVideo) return sock.sendMessage(jid, { text: "⚠️ Hanya support Gambar/Video" }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: "🎞️", key: m.key } });

                // Download Media
                const stream = await downloadContentFromMessage(quoted[mime], isImage ? 'image' : 'video');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }

                let finalBuffer = buffer;

                // Jika Gambar, ubah jadi Video pendek dulu agar bisa jadi GIF
                if (isImage) {
                    finalBuffer = await imageToGifVideo(buffer);
                }

                // Kirim sebagai Video dengan gifPlayback: true
                await sock.sendMessage(jid, { 
                    video: finalBuffer, 
                    caption: captionText || "🎁 Gift Generated", 
                    gifPlayback: true // Ini yang membuat video jadi GIF loop otomatis
                }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

            } catch (e) {
                console.error(e);
                await sock.sendMessage(jid, { text: `❌ Gagal membuat Gift: ${e.message}` }, { quoted: m });
            }
            return;
        }
        
        // === COMMAND: REMOVE BG & EDIT BG COLOR ===
        const bgCommands = ['.bg'];
        
        if (bgCommands.includes(cmd)) {
            try {
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted || !quoted.imageMessage) return sock.sendMessage(jid, { text: "⚠️ Reply Gambar dengan caption command (contoh: .bgred)" }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: "✂️", key: m.key } });

                // 1. Download & Upload
                const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
                const url = await uploadFile(buffer);

                // 2. Hapus BG
                const noBgBuffer = await removeBgApi(url);

                // 3. Proses Output
                if (cmd === '.bg') {
                    // Kirim Transparan (Harus Document agar tidak jadi hitam di WA)
                    await sock.sendMessage(jid, { document: noBgBuffer, mimetype: 'image/png', fileName: 'nobg.png', caption: "✅ Background Removed" }, { quoted: m });
                } else {
                    // Proses Warna
                    const colorMap = {
                        '.bgred': 'red', '.bgblue': 'blue', '.bggreen': 'green',
                        '.bgblack': 'black', '.bgwhite': 'white', '.bgpurple': 'purple', '.bgyellow': 'yellow'
                    };
                    
                    await sock.sendMessage(jid, { react: { text: "🎨", key: m.key } });
                    
                    // PANGGIL FUNGSI YANG BARU DIBUAT TADI
                    const coloredBuffer = await addBackgroundColor(noBgBuffer, colorMap[cmd]);
                    
                    await sock.sendMessage(jid, { image: coloredBuffer, caption: `✅ Background: ${colorMap[cmd]}` }, { quoted: m });
                }
                
                await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

            } catch (e) {
                console.error(e); // Cek console jika masih error
                await sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }, { quoted: m });
            }
            return;
        }
        
        // === COMMAND: STICKER (.stc) ===
        if (cmd.startsWith('.stc')) {
            try {
                // A. TEXT TO STICKER
                const args = text.split(' ').slice(1).join(' ');
                if (args.length > 0 && !m.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                     await sock.sendMessage(jid, { react: { text: "🎨", key: m.key } });
                     const url = `https://ui-avatars.com/api/?name=${encodeURIComponent(args)}&background=random&size=512&length=${args.length}&font-size=0.33`;
                     const { data } = await client.get(url, { responseType: 'arraybuffer' });
                     const stickerBuff = await createSticker(data, false);
                     await sock.sendMessage(jid, { sticker: stickerBuff }, { quoted: m });
                     return;
                }

                // B. IMAGE/VIDEO TO STICKER
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted) return sock.sendMessage(jid, { text: "⚠️ Reply Gambar/Video atau ketik text setelah .stc" }, { quoted: m });
                
                const mime = Object.keys(quoted)[0];
                const isImage = mime === 'imageMessage';
                const isVideo = mime === 'videoMessage';
                
                if (!isImage && !isVideo) return sock.sendMessage(jid, { text: "⚠️ Hanya support Gambar/Video" }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: "🔄", key: m.key } });

                const stream = await downloadContentFromMessage(quoted[mime], isImage ? 'image' : 'video');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }

                const stickerBuff = await createSticker(buffer, isVideo);
                await sock.sendMessage(jid, { sticker: stickerBuff }, { quoted: m });
                await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

            } catch (e) {
                console.error(e);
                await sock.sendMessage(jid, { text: `❌ Gagal membuat sticker: ${e.message}` }, { quoted: m });
            }
            return;
        }

        // === COMMAND: HD / REMINI (.hd) ===
        if (cmd.startsWith('.hd')) {
            try {
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted || !quoted.imageMessage) return sock.sendMessage(jid, { text: "⚠️ Reply Gambar dengan caption .hd" }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: "✨", key: m.key } });

                const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }

                const url = await uploadFile(buffer);
                const hdBuffer = await reminiImage(url);

                await sock.sendMessage(jid, { image: hdBuffer, caption: "✨ HD Success" }, { quoted: m });
                await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });
            } catch (e) {
                console.error(e);
                await sock.sendMessage(jid, { text: `❌ Gagal HD: ${e.message}` }, { quoted: m });
            }
            return;
        }
         
        // ==========================================
        //  👁️ COMMAND: RVO (READ VIEW ONCE)
        // ==========================================
        if (cmd === '.rvo') {
            try {
                const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted) return sock.sendMessage(jid, { text: "⚠️ Reply pesan View Once dengan .rvo" }, { quoted: m });

                // Deteksi struktur View Once (Bisa V1 atau V2)
                const viewOnceMsg = quoted.viewOnceMessage || quoted.viewOnceMessageV2;
                
                if (!viewOnceMsg) return sock.sendMessage(jid, { text: "⚠️ Pesan yang di-reply bukan View Once!" }, { quoted: m });

                // Ambil konten media (Image atau Video) dari dalam wrapper View Once
                const content = viewOnceMsg.message.imageMessage || viewOnceMsg.message.videoMessage;
                const typeMedia = viewOnceMsg.message.imageMessage ? 'image' : 'video';

                if (!content) return sock.sendMessage(jid, { text: "⚠️ Media tidak ditemukan/sudah kadaluarsa." }, { quoted: m });

                await sock.sendMessage(jid, { react: { text: "🔓", key: m.key } });

                // Download Media
                const stream = await downloadContentFromMessage(content, typeMedia);
                let buffer = Buffer.from([]);
                for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }

                // Kirim Balik sebagai media biasa
                if (typeMedia === 'image') {
                    await sock.sendMessage(jid, { image: buffer, caption: "🔓 *Succes Unlocked View Once*" }, { quoted: m });
                } else {
                    await sock.sendMessage(jid, { video: buffer, caption: "🔓 *Succes Unlocked View Once*" }, { quoted: m });
                }
                
                await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

            } catch (e) {
                console.error("RVO Error:", e);
                await sock.sendMessage(jid, { text: "❌ Gagal membuka View Once (Mungkin sudah ditarik/kadaluarsa)." }, { quoted: m });
            }
            return;
        }
        
        // === COMMAND: DOWNLOADER & MP3 (URL) ===
        const isMp3Cmd = cmd.startsWith('.mp3');
        const isUrl = text.match(/(http[s]?:\/\/[^\s]+)/);
        
        if ((isMp3Cmd || isUrl) && !cmd.startsWith('.stc') && !cmd.startsWith('.hd')) {
            const urlToProcess = isMp3Cmd ? text.split(' ')[1] : text;
            
            if (urlToProcess && urlToProcess.startsWith('http')) {
                let scraper = null;
                let platform = "";

                if (urlToProcess.includes("tiktok.com")) { scraper = Engine.tiktok; platform = "TikTok"; }
                else if (urlToProcess.includes("instagram.com")) { scraper = Engine.instagram; platform = "Instagram"; }
                else if (urlToProcess.includes("facebook.com") || urlToProcess.includes("fb.watch")) { scraper = Engine.facebook; platform = "Facebook"; }
                else if (urlToProcess.includes("youtube.com") || urlToProcess.includes("youtu.be")) { scraper = Engine.youtube; platform = "YouTube"; }
                else if (urlToProcess.includes("twitter.com") || urlToProcess.includes("x.com")) { scraper = Engine.twitter; platform = "Twitter"; }
                else if (urlToProcess.includes("pinterest.com") || urlToProcess.includes("pin.it")) { scraper = Engine.pinterest; platform = "Pinterest"; }
                else if (urlToProcess.includes("eporner.com")) { scraper = Engine.eporner; platform = "Eporner"; }
                else if (urlToProcess.includes("videqx.de")) { scraper = Engine.videqx; platform = "Videqx"; }
                else if (urlToProcess.includes("capcut.com")) { scraper = Engine.capcut; platform = "CapCut"; }
                else if (urlToProcess.includes("mediafire.com")) { scraper = Engine.mediafire; platform = "Mediafire"; }
                else if (urlToProcess.includes("terabox.com")) { scraper = Engine.terabox; platform = "Terabox"; }

                if (scraper) {
                    try {
                        await sock.sendMessage(jid, { react: { text: "⏳", key: m.key } });
                        const result = await scraper(urlToProcess);

                        // A. FITUR MP3
                        if (isMp3Cmd) {
                             if (result.type !== 'video' && result.type !== 'audio') throw new Error("Link bukan video/audio.");
                             
                             const fileData = await downloadAndSave(result);
                             await sock.sendMessage(jid, { react: { text: "🎵", key: m.key } });
                             const audioBuffer = await toAudio(fs.readFileSync(fileData.filePath), 'mp4');
                             
                             await sock.sendMessage(jid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
                             fs.unlinkSync(fileData.filePath);

                        // B. FITUR DOWNLOADER
                        } else {
                            if (result.type === 'slide') {
                                await sock.sendMessage(jid, { react: { text: "📸", key: m.key } });
                                await sock.sendMessage(jid, { text: `╭──「 *📸 SLIDE FOUND* 」
│ ◦ *Jumlah* : ${result.urls.length} Slide
│ └ _Sedang memproses media..._
╰─────────────────────` }, { quoted: m });
                                for (let i = 0; i < result.urls.length; i++) {
                                    const slideData = await downloadAndSave({ url: result.urls[i], type: 'image' });
                                    await sock.sendMessage(jid, { image: fs.readFileSync(slideData.filePath), caption: `Slide ${i+1}` });
                                    fs.unlinkSync(slideData.filePath);
                                }
                            } else {
                                await sock.sendMessage(jid, { react: { text: "⬇️", key: m.key } });
                                const fileData = await downloadAndSave(result);
                                const caption = `╭──「 *${platform.toUpperCase()}* 」
│ ◦ *Judul* : ${result.title || 'Tidak Ada Judul'}
│ └ _Berhasil diunduh_ ✅
╰─────────────────────`;
                                
                                if (fileData.type === 'video') {
                                    await sock.sendMessage(jid, { video: fs.readFileSync(fileData.filePath), caption, mimetype: 'video/mp4' }, { quoted: m });
                                } else if (fileData.type === 'image') {
                                    await sock.sendMessage(jid, { image: fs.readFileSync(fileData.filePath), caption }, { quoted: m });
                                } else if (fileData.type === 'document') {
                                    await sock.sendMessage(jid, { document: fs.readFileSync(fileData.filePath), mimetype: fileData.mimetype, fileName: result.title, caption }, { quoted: m });
                                }
                                fs.unlinkSync(fileData.filePath);
                            }
                        }
                        await sock.sendMessage(jid, { react: { text: "✅", key: m.key } });

                    } catch (e) {
                        console.error(e);
                        await sock.sendMessage(jid, { text: `❌ Error: ${e.message}` }, { quoted: m });
                        await sock.sendMessage(jid, { react: { text: "❌", key: m.key } });
                    }
                    return;
                }
            }
        }
    });
}

// EKSEKUSI UTAMA
(async () => {
    await loginInstagram();
    startBot().catch(e => console.error("Fatal Error:", e));
})();