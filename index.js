require('dotenv').config();
const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const sharp = require('sharp');
const Request = require('./models/Request');
const { google } = require("googleapis");
const { Readable } = require('stream');
const csv = require('fast-csv');
const path = require("path");

// drive upload 
const apikeys = require("./apikey.json");
const SCOPE = ["https://www.googleapis.com/auth/drive"];
async function authorize() {
    const jwtClient = new google.auth.JWT(
        apikeys.client_email,
        null,
        apikeys.private_key,
        SCOPE
    );

    await jwtClient.authorize();
    return jwtClient;
}

async function uploadFile(authClient, fileName, outputBuffer, mimeType) {
    return new Promise((resolve, reject) => {
        const drive = google.drive({ version: "v3", auth: authClient });

        let fileMetaData = {
            name: fileName,
            parents: ["1ig085XT6C-2D0nYjDW4jradbnXSds3ML"],
        };

        // Convert buffer to a readable stream
        const bufferStream = new Readable();
        bufferStream.push(outputBuffer);
        bufferStream.push(null);

        const media = {
            mimeType: mimeType,
            body: bufferStream
        };

        drive.files.create({
            resource: fileMetaData,
            media: media,
            fields: "id, webViewLink",
        }, function (err, file) {
            if (err) return reject(err);
            resolve(file);
        });
    });
}

const app = express();
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MONGODB connection successful."))
    .catch((error) => console.error("MONGODB connection failed.", error));

// 1. Upload API: Handles CSV file uploads
app.post('/api/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    console.log("Received file:", file);

    if (!file) return res.status(400).send('No file uploaded.');

    const requestId = uuidv4();
    let products = [];

    fs.createReadStream(file.path)
        .pipe(csvParser())
        .on('data', (row) => {
            let values = Object.entries(row)[0][1];
            values = values.split(',');
            let serialNumber = values[0];
            let productName = values[1];
            let inputUrls = [];
            let outputUrls = [];
            inputUrls.push(values[2]);
            products.push({
                serialNumber,
                productName,
                inputUrls,
                outputUrls
            });
            console.log('Products = ', products);
        })
        .on('end', async () => {
            // Save request in DB
            const request = new Request({ requestId, products, status: 'processing' });
            await request.save();

            // Process images and update the original CSV file (test.csv)
            const csvFilePath = './test.csv'; // Use relative path to your test.csv
            processImages(requestId, csvFilePath); // Pass the path of the original CSV file

            res.status(200).json({ requestId });
        });
});

// 2. Status API: Check processing status
app.get('/api/status/:requestId', async (req, res) => {
    const { requestId } = req.params;
    const request = await Request.findOne({ requestId });
    if (!request) return res.status(404).send('Request ID not found.');
    res.status(200).json({ status: request.status, products: request.products });
});

// Function to process images asynchronously
async function processImages(requestId, csvFilePath) {
    const request = await Request.findOne({ requestId });
    const products = request.products;

    const authClient = await authorize(); // Get Google Drive auth client

    // Map to store output URLs to append to the CSV
    const outputUrlMap = {};

    for (let product of products) {
        const outputUrls = [];

        for (let url of product.inputUrls) {
            try {
                console.log('Processing URL:', url);

                const response = await axios({ url, responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');

                // Compress the image
                const outputBuffer = await sharp(buffer).jpeg({ quality: 50 }).toBuffer();
                console.log("Buffer = ", outputBuffer);

                // Upload the buffer to Google Drive
                const fileName = `${uuidv4()}.jpg`; // Generate a unique file name
                const mimeType = 'image/jpeg'; // Set the mime type

                const file = await uploadFile(authClient, fileName, outputBuffer, mimeType);

                // Get the Google Drive file URL
                const outputUrl = `https://drive.google.com/uc?id=${file.data.id}&export=view`;
                console.log('Generated Google Drive URL:', outputUrl);

                outputUrls.push(outputUrl);
            } catch (error) {
                console.error('Error processing image:', error);
            }
        }

        product.outputUrls = outputUrls;

        // Ensure the map is updated with the serial number and URLs
        outputUrlMap[product.serialNumber] = outputUrls.join(','); // Store the output URL for appending
    }

    console.log("Final outputUrlMap:", outputUrlMap);  // Add this for debugging

    request.status = 'completed';
    await request.save();

    // After processing, update the CSV with the correct URLs
    appendUrlsToCSV(csvFilePath, outputUrlMap);
}

// Function to append the Output Image Urls to the original CSV file (test.csv)
function appendUrlsToCSV(csvFilePath, outputUrlMap) {
    const updatedRows = [];

    // Read the CSV, add the output URLs, and overwrite the original CSV file
    fs.createReadStream(csvFilePath)
        .pipe(csv.parse({ headers: true }))
        .on('data', (row) => {
            // Log the keys of the row to see the exact column headers
            console.log('Row Keys:', Object.keys(row));  // Debug to see the actual header names
            let serialNumber = Object.entries(row)[0][1].split(',')[0];
            console.log(`Updating row for Serial No.: ${serialNumber}`);

            const outputUrls = outputUrlMap[serialNumber] || '';  // Get output URLs for the row
            console.log(`Output URLs for Serial No. ${serialNumber}: ${outputUrls}`);

            row['Output Image Urls'] = outputUrls;  // Add new column with output URLs

            updatedRows.push(row);  // Collect the updated row
        })
        .on('end', () => {
            // Write updated rows to the same CSV file
            const csvStream = csv.format({ headers: true });
            const writableStream = fs.createWriteStream(csvFilePath); // Overwrite the original file

            csvStream.pipe(writableStream);
            updatedRows.forEach(row => csvStream.write(row));
            csvStream.end();

            console.log(`Updated CSV overwritten at ${csvFilePath}`);
        });
}

app.listen(3000, () => console.log('Server started on port 3000'));
