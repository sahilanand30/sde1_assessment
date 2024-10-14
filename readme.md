# Image Processing and Google Drive CSV Updater

## Overview

This Node.js application processes images listed in the `test.csv` file, uploads the processed images to Google Drive, and appends the Google Drive URLs to the same CSV file.

## How to run this project?
- Download the zip of this repo into your local and put MONGODB_URI into your .env
- Download the Google Drive API credentials from here: 
https://drive.google.com/file/d/1Nd0ETZKVM5llTan5dANNrEE3WYH9Tj9R/view?usp=drive_link 
- Run the "npm i" command to install all the dependencies
- Finally run "npm start" to spin up the project

## Usage

1. **Input File**: 
   - Place your input data in the `test.csv` file in the following format:

   ```"S. No.,Product Name,Input Image Urls"
      "1,Product A,https://fastly.picsum.photos/id/1079/200/300.jpg?hmac=2_Q-8QGaabS7GsZLCCM2JvTkNhZFjwv5K2wVnJ8CjKI"
      "2,Product B,https://fastly.picsum.photos/id/1079/200/300.jpg?hmac=2_Q-8QGaabS7GsZLCCM2JvTkNhZFjwv5K2wVnJ8CjKI"

2. **Output File**
   - The drive link of the output file will get appended in the "Output Image Urls" column of the csv. You can directly open that url into your browser.

## API Documentation
   - POST http://localhost:3000/api/upload
     Uploads the input files, compress it sharpen it and then save it to the Google drive.
     It returns a request_id.

   - GET http://localhost:3000/api/status/{request_id} 
     Put the request_id that you got from upload API into this and know the current status of the process.