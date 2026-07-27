import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();
dotenv.config({ path: path.join(__dirname, '../.env') });

// Gunakan JWT Pinata (Direkomendasikan oleh Pinata API terbaru)
// Dapatkan di: https://app.pinata.cloud/developers/api-keys
const PINATA_JWT = process.env.VITE_PINATA_JWT || process.env.PINATA_JWT || 'MASUKKAN_PINATA_JWT_ANDA_DISINI';

/**
 * LANGKAH A: Upload Gambar Sertifikat / Emas ke IPFS
 * @param {string} filePath Path file gambar di komputer lokal
 * @returns {string} URI IPFS berupa `ipfs://<CID>`
 */
async function uploadImageToIPFS(filePath) {
  try {
    const data = new FormData();
    data.append('file', fs.createReadStream(filePath));

    console.log("📤 Mengunggah gambar ke Pinata IPFS...");
    const response = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        // form-data perlu header boundary khusus
        ...data.getHeaders()
      }
    });

    const cid = response.data.IpfsHash;
    console.log(`✅ Gambar berhasil diunggah! CID: ${cid}`);
    return `ipfs://${cid}`;
  } catch (error) {
    console.error("❌ Gagal mengunggah gambar:", error.message);
    throw error;
  }
}

/**
 * LANGKAH C: Upload JSON Metadata (yang berisi info Gram, Kategori, dlL) ke IPFS
 * @param {Object} metadata Objek JSON yang mematuhi standar OpenSea
 * @returns {string} URI IPFS Metadata `ipfs://<CID>` (Ini akan jadi TokenURI)
 */
async function uploadMetadataToIPFS(metadataJSON) {
  try {
    console.log("📤 Mengunggah Metadata JSON ke Pinata IPFS...");
    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadataJSON, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PINATA_JWT}`
      }
    });

    const cid = response.data.IpfsHash;
    console.log(`✅ Metadata berhasil diunggah! CID Final: ${cid}`);
    return `ipfs://${cid}`;
  } catch (error) {
    console.error("❌ Gagal mengunggah metadata:", error.message);
    throw error;
  }
}

/**
 * CONTOH ALUR EKSEKUSI PENUH 
 */
async function main() {
  try {
    // Asumsi: Anda memiliki file 'sertifikat-emas.png' di folder yang sama
    // const imageFilePath = path.join(__dirname, 'sertifikat-emas.png');
    
    // -- LANGKAH A (Komentar dicabut jika file gambar sudah ada) --
    // const imageURI = await uploadImageToIPFS(imageFilePath);
    
    // Simulasi Image URI dari Langkah A
    const imageURI = "ipfs://QmbSimulasiHashGambarXyz1234567890abcdef"; 

    // -- LANGKAH B: Buat Standar Metadata JSON --
    const metadata = {
      name: "Sertifikat Emas - Kalung 5.5G",
      description: "Sertifikat resmi tanda kepemilikan aset fisik emas asli yang diverifikasi oleh sistem.",
      image: imageURI, // Link IPFS yang didapat dari Langkah A
      attributes: [
        {
          trait_type: "Kategori",
          value: "Emas Tua"
        },
        {
          trait_type: "Tipe Produk",
          value: "Kalung"
        },
        {
          display_type: "number", 
          trait_type: "Gram Emas", 
          value: 5.5 // Nilai numerik
        },
        {
          display_type: "date",
          trait_type: "Tanggal Cetak",
          value: Math.floor(Date.now() / 1000) // Epoch timestamp untuk OpenSea
        }
      ]
    };

    // -- LANGKAH C: Upload Metadata Format Akhir --
    const tokenURI = await uploadMetadataToIPFS(metadata);
    
    console.log("\n🎉 ALUR SELESAI 🎉");
    console.log("-----------------------------------------");
    console.log(`Gunakan link ini sebagai \`uri\` pada fungsi \`safeMint(to, uri)\` di Smart Contract:`);
    console.log(`-> ${tokenURI}`);
    console.log("-----------------------------------------");

  } catch (error) {
    console.error("Terjadi kegagalan di alur utama:", error);
  }
}

// Jalankan skrip
main();
