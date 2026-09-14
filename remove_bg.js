const Jimp = require('jimp');

async function removeBackground() {
    try {
        const image = await Jimp.read('public/mascot.png');
        
        // Get the background color from top-left corner
        const bgColor = image.getPixelColor(0, 0);
        const bgR = Jimp.intToRGBA(bgColor).r;
        const bgG = Jimp.intToRGBA(bgColor).g;
        const bgB = Jimp.intToRGBA(bgColor).b;

        const tolerance = 40; // color distance tolerance

        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            const diffR = Math.abs(r - bgR);
            const diffG = Math.abs(g - bgG);
            const diffB = Math.abs(b - bgB);

            if (diffR < tolerance && diffG < tolerance && diffB < tolerance) {
                // Set alpha to 0 for background pixels
                this.bitmap.data[idx + 3] = 0;
            } else {
                // Keep the glow somewhat transparent if it's borderline, or just leave it.
            }
        });

        await image.writeAsync('public/mascot.png');
        console.log('Background removed successfully!');
    } catch (err) {
        console.error('Error processing image:', err);
    }
}

removeBackground();
