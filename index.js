const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3003;

const MY_API_KEY = 'ABCD1234';

const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.get('X-API-KEY');
    if (apiKey && apiKey === MY_API_KEY) {
        next();
    } else {
        res.status(401).send('Invalid or missing API Key');
    }
};

app.use(express.json());

const createTimestampedDirectory = () => {
    const timestamp = Date.now().toString();
    const dir = path.join(__dirname, 'firmware', timestamp);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return { dir, timestamp };
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const { dir } = createTimestampedDirectory();
        req.timestampDir = dir;
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/upload-firmware', apiKeyMiddleware, upload.single('file'), (req, res) => {
    const version = req.body.version;
    const dir = req.timestampDir;

    fs.writeFileSync(path.join(dir, 'version.txt'), version);

    res.send('Firmware and version information uploaded successfully');
});

app.post('/check-update', apiKeyMiddleware, (req, res) => {
    const clientVersion = req.body.version;
    const firmwareDir = path.join(__dirname, 'firmware');

    try {
        if (!fs.existsSync(firmwareDir)) {
            return res.status(404).send('Firmware directory not found.');
        }

        const dirs = fs.readdirSync(firmwareDir).filter(file => {
            return fs.statSync(path.join(firmwareDir, file)).isDirectory();
        });

        dirs.sort((a, b) => parseInt(b) - parseInt(a));

        if (dirs.length === 0) {
            return res.status(404).send('No firmware versions found.');
        }

        const latestVersionFile = path.join(firmwareDir, dirs[0], 'version.txt');
        const latestVersion = fs.readFileSync(latestVersionFile, 'utf8').trim();

        if (clientVersion < latestVersion) {
            res.send('Update required');
        } else {
            res.send('Device is up to date');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while checking for updates');
    }
});

function getLatestFirmwareDir() {
    const firmwareDir = path.join(__dirname, 'firmware');
    if (!fs.existsSync(firmwareDir)) {
        console.log('Firmware directory does not exist.');
        return null;
    }

    const dirs = fs.readdirSync(firmwareDir).filter(file => {
        return fs.statSync(path.join(firmwareDir, file)).isDirectory();
    });

    dirs.sort((a, b) => parseInt(b) - parseInt(a));
    return dirs.length > 0 ? path.join(firmwareDir, dirs[0]) : null;
}

app.post('/download-firmware', (req, res) => {
    const clientVersion = req.body.version;
    const latestDir = getLatestFirmwareDir();

    if (!latestDir) {
        return res.status(404).send('No firmware versions available.');
    }

    const latestVersionFile = path.join(latestDir, 'version.txt');
    const latestVersion = fs.readFileSync(latestVersionFile, 'utf8').trim();

    if (clientVersion < latestVersion) {
        const firmwareFiles = fs.readdirSync(latestDir).filter(file => {
            return fs.statSync(path.join(latestDir, file)).isFile() && file.endsWith('.bin');
        });

        if (firmwareFiles.length === 0) {
            return res.status(404).send('Firmware file not found.');
        }

        const firmwareFilePath = path.join(latestDir, firmwareFiles[0]);
        res.download(firmwareFilePath);
    } else {
        res.send('Device is up to date');
    }
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
