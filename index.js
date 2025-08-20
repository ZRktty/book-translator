const fs = require('fs').promises;
const path = require('path');
const { createWorker } = require('tesseract.js');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');

class BookTranslator {
    constructor() {
        this.deeplKeys = []; // Add your DeepL API keys here
        this.currentKeyIndex = 0;
        this.characterUsage = {}; // Track usage per key
        this.terminology = new Map(); // Consistent translations
        this.contextBuffer = []; // Store previous paragraphs for context
        this.maxContextLength = 1500; // Characters to include as context
        this.chunkOverlap = 0.3; // 30% overlap between chunks

        // Initialize character usage tracking
        this.deeplKeys.forEach((key, index) => {
            this.characterUsage[index] = 0;
        });
    }

    // Add DeepL API keys
    addDeepLKeys(keys) {
        this.deeplKeys = keys;
        keys.forEach((key, index) => {
            this.characterUsage[index] = 0;
        });
        console.log(`✅ Added ${keys.length} DeepL API keys`);
    }

    // OCR processing for individual pages
    async processImageOCR(imagePath) {
        console.log(`🔍 Processing OCR for: ${path.basename(imagePath)}`);

        const worker = await createWorker('ces'); // Czech language

        try {
            // Preprocess image for better OCR
            const processedImagePath = await this.preprocessImage(imagePath);

            const { data: { text } } = await worker.recognize(processedImagePath);

            // Clean up processed image
            await fs.unlink(processedImagePath);

            return this.cleanOCRText(text);
        } finally {
            await worker.terminate();
        }
    }

    // Preprocess image for better OCR accuracy
    async preprocessImage(imagePath) {
        const outputPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '_processed.png');

        await sharp(imagePath)
            .greyscale()
            .normalize()
            .sharpen()
            .png()
            .toFile(outputPath);

        return outputPath;
    }

    // Clean OCR text
    cleanOCRText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/[""]/g, '"')
            .replace(/['']/g, "'")
            .replace(/—/g, '-')
            .trim();
    }

    // Get next available DeepL key
    getNextDeepLKey() {
        const maxCharsPerMonth = 490000; // Leave buffer under 500k limit

        // Find key with available quota
        for (let i = 0; i < this.deeplKeys.length; i++) {
            const keyIndex = (this.currentKeyIndex + i) % this.deeplKeys.length;
            if (this.characterUsage[keyIndex] < maxCharsPerMonth) {
                this.currentKeyIndex = keyIndex;
                return this.deeplKeys[keyIndex];
            }
        }

        throw new Error('All DeepL API keys have exceeded their monthly quota');
    }

    // Translate text with context continuity
    async translateWithContext(text, targetLang) {
        const key = this.getNextDeepLKey();

        // Build context from previous translations
        const context = this.buildContext();
        const fullText = context ? `${context}\n\n${text}` : text;

        try {
            console.log(`🌐 Translating ${text.length} characters to ${targetLang.toUpperCase()}...`);

            const response = await axios.post('https://api-free.deepl.com/v2/translate', {
                text: [fullText],
                target_lang: targetLang.toUpperCase(),
                source_lang: 'CS',
                preserve_formatting: true,
                formality: 'default'
            }, {
                headers: {
                    'Authorization': `DeepL-Auth-Key ${key}`,
                    'Content-Type': 'application/json'
                }
            });

            const translatedText = response.data.translations[0].text;

            // Update character usage
            this.characterUsage[this.currentKeyIndex] += fullText.length;

            // Extract only the new translation (remove context part)
            const newTranslation = context ?
                translatedText.substring(translatedText.indexOf('\n\n') + 2) :
                translatedText;

            // Update terminology database
            this.updateTerminology(text, newTranslation);

            // Update context buffer
            this.updateContextBuffer(newTranslation);

            console.log(`✅ Translation complete. Key usage: ${this.characterUsage[this.currentKeyIndex]} chars`);

            return newTranslation;

        } catch (error) {
            if (error.response?.status === 456) {
                console.log(`⚠️ Quota exceeded for current key, switching...`);
                this.characterUsage[this.currentKeyIndex] = 500000; // Mark as exhausted
                return this.translateWithContext(text, targetLang); // Retry with next key
            }
            throw error;
        }
    }

    // Build context from previous translations
    buildContext() {
        if (this.contextBuffer.length === 0) return null;

        const context = this.contextBuffer.join(' ').substring(0, this.maxContextLength);
        return `Previous context: ${context}`;
    }

    // Update context buffer with new translation
    updateContextBuffer(translation) {
        const sentences = translation.split(/[.!?]+/).filter(s => s.trim().length > 10);

        // Keep last 3-4 sentences as context for next translation
        this.contextBuffer = [...this.contextBuffer, ...sentences].slice(-4);

        // Trim if context gets too long
        while (this.contextBuffer.join(' ').length > this.maxContextLength) {
            this.contextBuffer.shift();
        }
    }

    // Update terminology database for consistency
    updateTerminology(original, translation) {
        // Extract potential names and important terms (simplified approach)
        const namePattern = /\b[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+\b/g;
        const originalNames = original.match(namePattern) || [];
        const translatedNames = translation.match(/\b[A-ZÁÉÍÓÚÑÜÇÀÈÙÂÊÎÔÛÄÖß][a-záéíóúñüçàèùâêîôûäöß]+\b/g) || [];

        // Store name mappings
        originalNames.forEach((name, index) => {
            if (translatedNames[index]) {
                this.terminology.set(name, translatedNames[index]);
            }
        });
    }

    // Process all images in a directory
    async processBook(inputDir, outputDir) {
        console.log(`📚 Starting book translation process...`);
        console.log(`Input: ${inputDir}`);
        console.log(`Output: ${outputDir}`);

        // Create output directory
        await fs.mkdir(outputDir, { recursive: true });

        // Get all image files
        const files = await fs.readdir(inputDir);
        const imageFiles = files
            .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
            .sort((a, b) => {
                // Natural sort for page numbers
                const aNum = parseInt(a.match(/\d+/) || [0]);
                const bNum = parseInt(b.match(/\d+/) || [0]);
                return aNum - bNum;
            });

        console.log(`📄 Found ${imageFiles.length} pages to process`);

        // Process each page
        const pages = [];
        for (let i = 0; i < imageFiles.length; i++) {
            const imagePath = path.join(inputDir, imageFiles[i]);
            const pageNum = i + 1;

            console.log(`\n📖 Processing page ${pageNum}/${imageFiles.length}`);

            try {
                // OCR
                const ocrText = await this.processImageOCR(imagePath);

                if (ocrText.trim().length < 10) {
                    console.log(`⚠️ Page ${pageNum}: Minimal text detected, skipping`);
                    continue;
                }

                // Translate to both languages
                const spanishText = await this.translateWithContext(ocrText, 'es');
                await this.delay(1000); // Rate limiting

                const englishText = await this.translateWithContext(ocrText, 'en');
                await this.delay(1000); // Rate limiting

                pages.push({
                    pageNum,
                    original: ocrText,
                    spanish: spanishText,
                    english: englishText
                });

                // Save intermediate results
                await this.saveIntermediateResults(pages, outputDir);

                console.log(`✅ Page ${pageNum} completed`);

            } catch (error) {
                console.error(`❌ Error processing page ${pageNum}:`, error.message);
            }
        }

        // Generate final PDFs
        await this.generatePDFs(pages, outputDir);

        // Save terminology database
        await this.saveTerminology(outputDir);

        console.log(`\n🎉 Translation completed!`);
        console.log(`📊 Character usage by key:`);
        this.deeplKeys.forEach((key, index) => {
            console.log(`   Key ${index + 1}: ${this.characterUsage[index].toLocaleString()} characters`);
        });
    }

    // Generate PDFs for translations
    async generatePDFs(pages, outputDir) {
        console.log(`📄 Generating PDF files...`);

        // Spanish PDF
        await this.createPDF(pages, 'spanish', path.join(outputDir, 'book_spanish.pdf'));

        // English PDF
        await this.createPDF(pages, 'english', path.join(outputDir, 'book_english.pdf'));

        // Original Czech PDF
        await this.createPDF(pages, 'original', path.join(outputDir, 'book_original.pdf'));
    }

    // Create PDF document
    async createPDF(pages, language, outputPath) {
        const doc = new PDFDocument({
            margin: 50,
            font: 'Helvetica'
        });

        doc.pipe(require('fs').createWriteStream(outputPath));

        // Title page
        doc.fontSize(20).text(`Book Translation - ${language.toUpperCase()}`, {
            align: 'center'
        });
        doc.moveDown(2);

        // Content pages
        pages.forEach(page => {
            doc.addPage();
            doc.fontSize(10).text(`Page ${page.pageNum}`, { align: 'right' });
            doc.moveDown();
            doc.fontSize(12).text(page[language], {
                align: 'justify',
                lineGap: 2
            });
        });

        doc.end();
        console.log(`✅ ${language.toUpperCase()} PDF saved: ${outputPath}`);
    }

    // Save intermediate results
    async saveIntermediateResults(pages, outputDir) {
        const progressPath = path.join(outputDir, 'translation_progress.json');
        await fs.writeFile(progressPath, JSON.stringify({
            pages,
            terminology: Object.fromEntries(this.terminology),
            characterUsage: this.characterUsage,
            timestamp: new Date().toISOString()
        }, null, 2));
    }

    // Save terminology database
    async saveTerminology(outputDir) {
        const terminologyPath = path.join(outputDir, 'terminology.json');
        await fs.writeFile(terminologyPath, JSON.stringify(
            Object.fromEntries(this.terminology),
            null,
            2
        ));
        console.log(`📝 Terminology saved: ${terminologyPath}`);
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Display usage statistics
    displayStats() {
        console.log('\n📊 Current Usage Statistics:');
        this.deeplKeys.forEach((key, index) => {
            const usage = this.characterUsage[index];
            const percentage = (usage / 500000 * 100).toFixed(1);
            console.log(`Key ${index + 1}: ${usage.toLocaleString()} chars (${percentage}%)`);
        });
    }
}

// Usage example and main execution
async function main() {
    const translator = new BookTranslator();

    // Add your DeepL API keys here
    const deeplKeys = [
        'your-first-deepl-api-key',
        'your-second-deepl-api-key',
        'your-third-deepl-api-key'
        // Add more keys as needed
    ];

    translator.addDeepLKeys(deeplKeys);

    // Set input and output directories
    const inputDir = './scanned_pages';  // Directory with your scanned images
    const outputDir = './translated_book'; // Output directory

    try {
        await translator.processBook(inputDir, outputDir);
    } catch (error) {
        console.error('❌ Translation failed:', error.message);
    }
}

// Export for use as module
module.exports = BookTranslator;

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
