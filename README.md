# Book Translator

This Node.js application translates a Czech book from a series of scanned page images into Spanish and English PDFs. It uses the DeepL API for translation and Tesseract.js for OCR.

## 🚀 Key Features

### Context Continuity
- **Context Buffer**: Maintains a buffer of previous paragraphs to provide context for the next translation, preserving narrative flow.
- **Overlapping Chunks**: Uses overlapping translation chunks to ensure smooth transitions.
- **Terminology Database**: Builds a terminology database to ensure consistent translation of character names and important terms.

### DeepL API Management
- **Key Rotation**: Automatically rotates through a list of multiple DeepL API keys to manage usage quotas.
- **Usage Tracking**: Tracks character usage for each API key.
- **Quota Fallback**: Gracefully switches to the next available key if a quota is exceeded.
- **Rate Limiting**: Includes built-in rate limiting to avoid hitting API limits.

### OCR & Processing
- **Czech OCR**: Uses Tesseract.js with Czech language support to extract text from images.
- **Image Preprocessing**: Includes image preprocessing (greyscale, normalization, sharpening) to improve OCR accuracy.
- **Text Cleaning**: Cleans and normalizes the OCR output for better translation quality.

### Output Generation
- **PDFs**: Generates separate PDF files for the Spanish, English, and original Czech text.
- **Incremental Saves**: Saves progress incrementally after each page, allowing the process to be resumed.
- **Terminology Export**: Exports the generated terminology database to a JSON file.
- **Usage Statistics**: Displays detailed usage statistics for each API key at the end of the process.

## 📋 Setup Instructions

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Prepare Your Files**:
    - Create a directory named `scanned_pages` in the root of the project.
    - Add your scanned page images (in JPG or PNG format) to this directory.
    - Ensure the files are named sequentially to maintain the correct order (e.g., `page01.jpg`, `page02.jpg`, `page03.jpg`).

3.  **Add DeepL API Keys**:
    - Open the `index.js` file.
    - Find the `deeplKeys` array within the `main()` function.
    - Add your DeepL API keys to this array. You can use multiple free accounts.
    ```javascript
    const deeplKeys = [
        'your-first-deepl-api-key',
        'your-second-deepl-api-key',
        // Add more keys as needed
    ];
    ```

4.  **Run the Translator**:
    ```bash
    npm start
    ```

## 💡 How Context Continuity Works

The application uses several techniques to maintain context across the entire book:
- **Overlapping Chunks**: Each chunk of text sent for translation includes some context from the previous paragraphs.
- **Terminology Tracking**: Key terms and character names are identified and stored to ensure they are translated consistently throughout the book.
- **Context Buffer**: A sliding window of the last 3-4 sentences from recent translations is kept in memory to inform the next translation.

## 📊 Notes for a Large Book (e.g., 480 Pages)

- With 3-4 free DeepL accounts, you should have a total quota of 1.5-2 million characters, which is typically sufficient. The application will automatically manage the keys and display usage statistics upon completion.
- The expected processing time for a book of this size is approximately 2-3 hours, depending on the complexity of the pages and the speed of your machine. This includes time for OCR and the deliberate delays for API rate limiting.

Ready to start translating? Just add your DeepL API keys and drop your scanned pages into the `scanned_pages` folder!
