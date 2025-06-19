const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'upload', path.dirname(file.originalname));
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, path.basename(file.originalname));
  }
});

const upload = multer({ storage });

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

app.post('/upload', upload.array('files'), async (req, res) => {
  const files = req.files;
  const hashMap = new Map();
  const duplicates = [];

  for (const file of files) {
    const fullPath = file.path;
    const hash = await getFileHash(fullPath);
    if (hashMap.has(hash)) {
      duplicates.push({
        duplicatePath: fullPath,
        originalPath: hashMap.get(hash)
      });
    } else {
      hashMap.set(hash, fullPath);
    }
  }

  res.json({ duplicates });
});

app.post('/delete-duplicates', (req, res) => {
  const { files } = req.body;
  const deleted = [];

  // 1. Delete duplicate files
  files.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted.push(filePath);
    }
  });

  // 2. Prepare destination folder
  const sourceDir = path.join(__dirname, 'upload');
  const destDir = path.join(__dirname, 'stored');
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true }); // Clean old files
  }
  fs.mkdirSync(destDir, { recursive: true });

  // 3. Copy remaining files from upload → stored
  function copyRemainingFiles(src, dest) {
    fs.readdirSync(src, { withFileTypes: true }).forEach(entry => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyRemainingFiles(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }

  copyRemainingFiles(sourceDir, destDir);

  res.json({
    message: 'Duplicates deleted and remaining files stored.',
    deleted,
    storedAt: destDir
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
