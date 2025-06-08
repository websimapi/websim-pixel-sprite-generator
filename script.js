// Main application controller for Pixel Sprite Animation Generator
class PixelSpriteGenerator {
    constructor() {
        // Initialize canvas and context
        this.canvas = document.getElementById('sprite-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Animation state
        this.sprites = [];
        this.currentFrame = 0;
        this.totalFrames = 0;
        this.isAnimating = false;
        this.animationId = null;
        this.animationSpeed = 12; // fps
        
        // Configuration
        this.characterType = 'human';
        this.pixelStyle = 'classic';
        this.colorPalette = 'standard';
        this.animationType = 'idle';
        this.frameCount = 4;
        
        // AI Reference Image
        this.referenceImageURL = null;
        this.aiGeneratedColors = null;
        
        // Pixel size mappings
        this.pixelSizes = {
            'minimal': 16,
            'classic': 32,
            'detailed': 64
        };
        
        // Color palette mappings
        this.palettes = {
            'gameboy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
            'nes': [
                '#000000', '#fcfcfc', '#f8f8f8', '#bcbcbc', 
                '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8', 
                '#0000fc', '#b8b8f8', '#6888fc', '#4038c0', 
                '#3c3c3c', '#f8b8f8', '#d8b8f8', '#6844fc'
            ],
            'standard': this.generateStandardPalette(32)
        };
        
        // Initialize the UI
        this.initUI();
    }
    
    initUI() {
        // Connect UI elements to properties
        document.getElementById('character-type').addEventListener('change', (e) => {
            this.characterType = e.target.value;
        });
        
        document.getElementById('pixel-style').addEventListener('change', (e) => {
            this.pixelStyle = e.target.value;
            document.getElementById('sprite-size').textContent = `${this.pixelSizes[this.pixelStyle]}x${this.pixelSizes[this.pixelStyle]}`;
        });
        
        document.getElementById('color-palette').addEventListener('change', (e) => {
            this.colorPalette = e.target.value;
        });
        
        document.getElementById('animation-type').addEventListener('change', (e) => {
            this.animationType = e.target.value;
        });
        
        const frameCountSlider = document.getElementById('frame-count');
        frameCountSlider.addEventListener('input', (e) => {
            this.frameCount = parseInt(e.target.value);
            document.getElementById('frame-count-value').textContent = this.frameCount;
        });
        
        const animationSpeedSlider = document.getElementById('animation-speed');
        animationSpeedSlider.addEventListener('input', (e) => {
            this.animationSpeed = parseInt(e.target.value);
            document.getElementById('animation-speed-value').textContent = `${this.animationSpeed} fps`;
            
            // Update animation if it's running
            if (this.isAnimating) {
                this.stopAnimation();
                this.startAnimation();
            }
        });
        
        // Button actions
        document.getElementById('generate-sprite').addEventListener('click', () => this.generateSprite());
        document.getElementById('export-sprite').addEventListener('click', () => this.exportSpritesheet());
        document.getElementById('play-pause').addEventListener('click', () => this.toggleAnimation());
        
        // Frame slider
        document.getElementById('frame-slider').addEventListener('input', (e) => {
            if (this.totalFrames > 0) {
                const normalizedValue = e.target.value / 100;
                this.currentFrame = Math.floor(normalizedValue * (this.totalFrames - 1));
                this.renderCurrentFrame();
            }
        });
        
        // AI Reference Image Generation
        document.getElementById('generate-reference').addEventListener('click', () => this.generateReferenceImage());
        document.getElementById('use-reference').addEventListener('click', () => this.useReferenceImage());
    }
    
    async generateReferenceImage() {
        const descriptionElement = document.getElementById('character-description');
        const description = descriptionElement.value.trim();
        
        if (!description) {
            alert('Please enter a character description');
            return;
        }
        
        // Get selected style
        const styleRadios = document.getElementsByName('ai-style');
        let selectedStyle = 'cartoon';
        for (const radio of styleRadios) {
            if (radio.checked) {
                selectedStyle = radio.value;
                break;
            }
        }
        
        // Show loading state
        const generateButton = document.getElementById('generate-reference');
        generateButton.disabled = true;
        generateButton.textContent = 'Generating...';  
        generateButton.classList.add('loading');
        
        try {
            // Create a prompt that specifies the character and style
            let prompt = '';
            
            switch (selectedStyle) {
                case 'pixel':
                    prompt = `A pixel art character design of ${description}. Single character centered, facing forward, full body visible, clean pixel art style with sharp edges and limited color palette.`;
                    break;
                case 'realistic':
                    prompt = `A realistic character design of ${description}. Single character centered, facing forward, full body visible, detailed shading and textures.`;
                    break;
                case 'cartoon':
                default:
                    prompt = `A cartoon character design of ${description}. Single character centered, facing forward, full body visible, clean lines and simple colors.`;
                    break;
            }
            
            // Generate the image using websim AI
            const result = await websim.imageGen({
                prompt: prompt,
                aspect_ratio: "1:1"
            });
            
            // Display the generated image
            const referenceContainer = document.getElementById('reference-container');
            const referenceImage = document.getElementById('reference-image');
            
            // Set crossOrigin to "anonymous" to allow reading pixel data if server supports CORS
            referenceImage.crossOrigin = "Anonymous";

            referenceImage.onload = () => {
                // Extract colors from the image now that it's loaded.
                // This might still fail if the server doesn't send CORS headers, so we wrap it in a try-catch.
                try {
                    this.extractColorsFromReference(referenceImage);
                } catch (e) {
                    console.error("Failed to extract colors from reference image:", e);
                    if (e.name === 'SecurityError') {
                        alert('Could not analyze reference image due to cross-origin policy. AI-generated palette will not be available.');
                    } else {
                        alert('An error occurred while analyzing the reference image.');
                    }
                }
            };

            referenceImage.onerror = () => {
                // This will likely fire if CORS is not supported by the image server.
                alert('Could not load or analyze reference image due to cross-origin policy. AI-generated palette will not be available.');
                // We can still display the image, but color extraction will be skipped.
                referenceImage.onload = null; // Prevent future onload events
            };

            referenceImage.src = result.url; // Set src AFTER onload and crossOrigin
            referenceContainer.style.display = 'block';
            
            // Store the reference image URL for later use
            this.referenceImageURL = result.url;
            
        } catch (error) {
            console.error('Error generating image:', error);
            alert('Failed to generate image. Please try again.');
        } finally {
            // Reset button state
            generateButton.disabled = false;
            generateButton.textContent = 'Generate Reference Image';
            generateButton.classList.remove('loading');
        }
    }
    
    extractColorsFromReference(image) {
        // Create a temporary canvas to analyze the image
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        tempCanvas.width = image.width;
        tempCanvas.height = image.height;
        
        // Draw the image to the canvas
        tempContext.drawImage(image, 0, 0, image.width, image.height);
        
        // Get image data
        const imageData = tempContext.getImageData(0, 0, image.width, image.height);
        const pixels = imageData.data;
        
        // Analyze colors (basic implementation - could be improved with clustering algorithms)
        const colorMap = {};
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            
            // Skip transparent pixels
            if (pixels[i + 3] < 128) continue;
            
            // Quantize colors to reduce similar shades
            const quantizedR = Math.floor(r / 16) * 16;
            const quantizedG = Math.floor(g / 16) * 16;
            const quantizedB = Math.floor(b / 16) * 16;
            
            const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
            if (colorMap[colorKey]) {
                colorMap[colorKey]++;
            } else {
                colorMap[colorKey] = 1;
            }
        }
        
        // Convert to array of [color, count] and sort by count
        const colorCounts = Object.entries(colorMap).map(([color, count]) => {
            const [r, g, b] = color.split(',').map(Number);
            return [`rgb(${r},${g},${b})`, count];
        });
        
        colorCounts.sort((a, b) => b[1] - a[1]);
        
        // Extract the most common colors (up to 16)
        this.aiGeneratedColors = colorCounts.slice(0, 16).map(item => item[0]);
        
        console.log('Extracted colors:', this.aiGeneratedColors);
    }
    
    useReferenceImage() {
        if (!this.referenceImageURL) {
            alert('Please generate a reference image first');
            return;
        }
        
        // Determine the character type based on the image
        const description = document.getElementById('character-description').value.toLowerCase();
        
        if (description.includes('robot') || description.includes('mech') || description.includes('android')) {
            document.getElementById('character-type').value = 'robot';
            this.characterType = 'robot';
        } else if (description.includes('wizard') || description.includes('elf') || description.includes('fantasy') || 
                  description.includes('knight') || description.includes('dragon') || description.includes('warrior')) {
            document.getElementById('character-type').value = 'fantasy';
            this.characterType = 'fantasy';
        } else if (description.includes('animal') || description.includes('cat') || description.includes('dog') || 
                  description.includes('creature') || description.includes('beast') || description.includes('monster')) {
            document.getElementById('character-type').value = 'animal';
            this.characterType = 'animal';
        } else {
            document.getElementById('character-type').value = 'human';
            this.characterType = 'human';
        }
        
        // If we extracted colors, create a custom palette
        if (this.aiGeneratedColors && this.aiGeneratedColors.length > 0) {
            // Add the AI-generated palette to our palette options
            this.palettes['ai-generated'] = this.aiGeneratedColors;
            
            // Create or update the option in the select element
            const paletteSelect = document.getElementById('color-palette');
            let aiOption = paletteSelect.querySelector('option[value="ai-generated"]');
            
            if (!aiOption) {
                aiOption = document.createElement('option');
                aiOption.value = 'ai-generated';
                aiOption.textContent = 'AI Generated Colors';
                paletteSelect.appendChild(aiOption);
            }
            
            // Select the AI-generated palette
            paletteSelect.value = 'ai-generated';
            this.colorPalette = 'ai-generated';
        }
        
        // Automatically generate the sprite
        this.generateSprite();
    }
    
    generateStandardPalette(count) {
        // Generate a standard palette with good range of colors
        const palette = [];
        
        // Add grayscale
        for (let i = 0; i < 8; i++) {
            const value = Math.floor(i * 255 / 7);
            palette.push(`rgb(${value},${value},${value})`);
        }
        
        // Add colors (hue variations)
        for (let h = 0; h < 12; h++) {
            for (let s = 100; s >= 50; s -= 50) {
                for (let l = 70; l >= 30; l -= 40) {
                    if (palette.length < count) {
                        palette.push(`hsl(${h * 30}, ${s}%, ${l}%)`);
                    }
                }
            }
        }
        
        return palette.slice(0, count);
    }
    
    generateSprite() {
        // Clear previous sprites
        this.sprites = [];
        this.stopAnimation();
        
        // Set the number of frames to generate
        this.totalFrames = this.frameCount;
        
        // Get pixel size based on selected style
        const pixelSize = this.pixelSizes[this.pixelStyle];
        
        // Create frames based on animation type and character type
        for (let i = 0; i < this.totalFrames; i++) {
            const spriteData = this.generateSpriteFrame(i, pixelSize);
            this.sprites.push(spriteData);
        }
        
        // Update UI
        document.getElementById('sprite-frames').textContent = this.totalFrames;
        document.getElementById('frame-slider').disabled = false;
        document.getElementById('export-sprite').disabled = false;
        
        // Start animation
        this.currentFrame = 0;
        this.startAnimation();
    }
    
    generateSpriteFrame(frameIndex, pixelSize) {
        // Create an offscreen canvas to generate the sprite
        const spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = pixelSize;
        spriteCanvas.height = pixelSize;
        const spriteCtx = spriteCanvas.getContext('2d');
        
        // Get color palette
        const colors = this.palettes[this.colorPalette];
        
        // Clear with transparent background
        spriteCtx.clearRect(0, 0, pixelSize, pixelSize);
        
        // If we have a reference image, draw that first (downscaled and faded)
        if (this.referenceImageURL) {
            const img = document.getElementById('reference-image');
            
            if (img && img.complete && img.naturalHeight !== 0) {
                // Draw reference as a faded background guide
                spriteCtx.globalAlpha = 0.2;
                spriteCtx.drawImage(img, 0, 0, pixelSize, pixelSize);
                spriteCtx.globalAlpha = 1.0;
            }
        }
        
        // Generate the sprite based on character and animation type
        switch (this.characterType) {
            case 'human':
                this.generateHumanSprite(spriteCtx, frameIndex, pixelSize, colors);
                break;
            case 'fantasy':
                this.generateFantasySprite(spriteCtx, frameIndex, pixelSize, colors);
                break;
            case 'robot':
                this.generateRobotSprite(spriteCtx, frameIndex, pixelSize, colors);
                break;
            case 'animal':
                this.generateAnimalSprite(spriteCtx, frameIndex, pixelSize, colors);
                break;
        }
        
        return spriteCanvas;
    }
    
    // Character generation methods
    generateHumanSprite(ctx, frameIndex, size, colors) {
        // Choose colors for the sprite
        const skinColor = colors[Math.floor(Math.random() * colors.length / 3) + colors.length / 3];
        const hairColor = colors[Math.floor(Math.random() * colors.length / 2)];
        const clothesColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Scale factor based on size
        const scale = size / 32; // Normalized to 32x32 base
        
        // Body parameters
        const headSize = 8 * scale;
        const bodyHeight = 10 * scale;
        const limbWidth = 4 * scale;
        
        // Center coordinates
        const centerX = size / 2;
        const groundY = size - 4 * scale;
        
        // Draw based on animation type and frame
        switch (this.animationType) {
            case 'idle':
                // Draw slight bobbing motion
                const idleOffset = Math.sin(frameIndex / this.totalFrames * Math.PI * 2) * scale;
                
                // Draw head
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize + idleOffset, headSize, headSize);
                
                // Draw body
                ctx.fillStyle = clothesColor;
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight + idleOffset, bodyHeight/1.5, bodyHeight);
                
                // Draw limbs
                ctx.fillStyle = skinColor;
                // Arms
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth + idleOffset/2, 
                           groundY - bodyHeight + 2*scale + idleOffset, 
                           limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3 - idleOffset/2, 
                           groundY - bodyHeight + 2*scale + idleOffset, 
                           limbWidth, bodyHeight/1.5);
                // Legs
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                
                // Hair
                ctx.fillStyle = hairColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize + idleOffset, headSize, headSize/3);
                break;
                
            case 'walk':
                // Animation cycle for walking
                const walkPhase = frameIndex / this.totalFrames;
                const stepHeight = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                
                // Draw head
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw body
                ctx.fillStyle = clothesColor;
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw limbs with walking motion
                ctx.fillStyle = skinColor;
                // Arms (swinging)
                const armSwing = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth - armSwing, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3 + armSwing, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs (stepping)
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, 
                           groundY - bodyHeight/1.8 - stepHeight, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, 
                           groundY - bodyHeight/1.8 + stepHeight, 
                           limbWidth, bodyHeight/1.8);
                
                // Hair
                ctx.fillStyle = hairColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize, headSize, headSize/3);
                break;
                
            case 'run':
                // Faster and more exaggerated walking
                const runPhase = frameIndex / this.totalFrames;
                const runStepHeight = Math.sin(runPhase * Math.PI * 2) * 3 * scale;
                const bodyTilt = Math.sin(runPhase * Math.PI * 2) * scale;
                
                // Draw head (tilted forward slightly)
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2 + scale, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw body (leaning forward)
                ctx.fillStyle = clothesColor;
                ctx.fillRect(centerX - bodyHeight/3 + scale, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw limbs with running motion
                ctx.fillStyle = skinColor;
                // Arms (extended swinging)
                const runArmSwing = Math.sin(runPhase * Math.PI * 2) * 4 * scale;
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth - runArmSwing + bodyTilt, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3 + runArmSwing + bodyTilt, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs (extended stepping)
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, 
                           groundY - bodyHeight/1.8 - runStepHeight, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, 
                           groundY - bodyHeight/1.8 + runStepHeight, 
                           limbWidth, bodyHeight/1.8);
                
                // Hair flowing backward
                ctx.fillStyle = hairColor;
                ctx.fillRect(centerX - headSize/2 + scale, groundY - bodyHeight - headSize, headSize, headSize/3);
                ctx.fillRect(centerX - headSize/2 - scale, groundY - bodyHeight - headSize + headSize/3, scale*2, headSize/6);
                break;
                
            case 'jump':
                // Jump has distinct phases: crouch, rise, peak, fall
                let jumpY = 0;
                if (frameIndex < this.totalFrames / 4) {
                    // Crouch phase
                    jumpY = -scale;
                } else if (frameIndex < this.totalFrames / 2) {
                    // Rise phase
                    const t = (frameIndex - this.totalFrames / 4) / (this.totalFrames / 4);
                    jumpY = -scale * 8 * t;
                } else if (frameIndex < 3 * this.totalFrames / 4) {
                    // Peak phase
                    jumpY = -scale * 8;
                } else {
                    // Fall phase
                    const t = (frameIndex - 3 * this.totalFrames / 4) / (this.totalFrames / 4);
                    jumpY = -scale * 8 * (1-t);
                }
                
                // Draw head
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize + jumpY, headSize, headSize);
                
                // Draw body
                ctx.fillStyle = clothesColor;
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight + jumpY, bodyHeight/1.5, bodyHeight);
                
                // Draw limbs
                ctx.fillStyle = skinColor;
                // Arms up when jumping
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth, 
                           groundY - bodyHeight - scale * 2 + jumpY, 
                           limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3, 
                           groundY - bodyHeight - scale * 2 + jumpY, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs tucked when jumping
                if (frameIndex > this.totalFrames / 4 && frameIndex < 3 * this.totalFrames / 4) {
                    // Tucked during peak
                    ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, 
                               groundY - bodyHeight/1.8 - scale * 2 + jumpY, 
                               limbWidth, bodyHeight/2.5);
                    ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, 
                               groundY - bodyHeight/1.8 - scale * 2 + jumpY, 
                               limbWidth, bodyHeight/2.5);
                } else {
                    // Extended during crouch/landing
                    ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, 
                               groundY - bodyHeight/1.8 + jumpY, 
                               limbWidth, bodyHeight/1.8);
                    ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, 
                               groundY - bodyHeight/1.8 + jumpY, 
                               limbWidth, bodyHeight/1.8);
                }
                
                // Hair
                ctx.fillStyle = hairColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize + jumpY, headSize, headSize/3);
                break;
                
            case 'attack':
                // Attack animation
                const attackPhase = frameIndex / this.totalFrames;
                let armExtension = 0;
                
                if (attackPhase < 0.3) {
                    // Wind up
                    armExtension = -attackPhase * 10 * scale;
                } else if (attackPhase < 0.5) {
                    // Strike
                    const t = (attackPhase - 0.3) / 0.2;
                    armExtension = -3 * scale + t * 12 * scale;
                } else {
                    // Hold
                    armExtension = 6 * scale;
                }
                
                // Draw head (turned slightly)
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2 + scale, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw body (twisted for attack)
                ctx.fillStyle = clothesColor;
                ctx.fillRect(centerX - bodyHeight/3 + scale/2, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw limbs
                ctx.fillStyle = skinColor;
                // Attack arm
                ctx.fillRect(centerX + bodyHeight/3 + armExtension, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth + 2*scale, limbWidth);
                
                // Other arm
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs in stable position
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2 - scale, 
                           groundY - bodyHeight/1.8, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2 + scale, 
                           groundY - bodyHeight/1.8, 
                           limbWidth, bodyHeight/1.8);
                
                // Hair
                ctx.fillStyle = hairColor;
                ctx.fillRect(centerX - headSize/2 + scale, groundY - bodyHeight - headSize, headSize, headSize/3);
                break;
        }
    }
    
    generateFantasySprite(ctx, frameIndex, size, colors) {
        // Choose colors for the sprite
        const skinColor = colors[Math.floor(Math.random() * colors.length / 3) + colors.length / 3];
        const outfitColor = colors[Math.floor(Math.random() * colors.length)];
        const accentColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Scale factor based on size
        const scale = size / 32; // Normalized to 32x32 base
        
        // Body parameters
        const headSize = 8 * scale;
        const bodyHeight = 10 * scale;
        const limbWidth = 4 * scale;
        
        // Center coordinates
        const centerX = size / 2;
        const groundY = size - 4 * scale;
        
        // Draw based on animation type and frame
        switch (this.animationType) {
            case 'idle':
                // Draw slight bobbing motion
                const idleOffset = Math.sin(frameIndex / this.totalFrames * Math.PI * 2) * scale;
                
                // Draw fancy hat/helmet
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX - headSize/2 - scale*2, groundY - bodyHeight - headSize - scale*2 + idleOffset, headSize + scale*4, scale*2);
                
                // Draw head
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize + idleOffset, headSize, headSize);
                
                // Draw fancy outfit/armor
                ctx.fillStyle = outfitColor;
                // Shoulder pads
                ctx.fillRect(centerX - bodyHeight/3 - scale*2, groundY - bodyHeight + idleOffset, scale*2, scale*3);
                ctx.fillRect(centerX + bodyHeight/3, groundY - bodyHeight + idleOffset, scale*2, scale*3);
                // Body
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight + idleOffset, bodyHeight/1.5, bodyHeight);
                
                // Draw cape/cloak with slight movement
                ctx.fillStyle = accentColor;
                const capeWidth = bodyHeight/1.2;
                const capeOffset = Math.sin(frameIndex / this.totalFrames * Math.PI * 2 + Math.PI/4) * scale/2;
                ctx.fillRect(centerX - capeWidth/2 + capeOffset, 
                           groundY - bodyHeight + 2*scale + idleOffset, 
                           capeWidth, bodyHeight - scale);
                
                // Draw limbs
                ctx.fillStyle = skinColor;
                // Arms
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth + idleOffset/2, 
                           groundY - bodyHeight + 3*scale + idleOffset, 
                           limbWidth, bodyHeight/1.5 - scale);
                ctx.fillRect(centerX + bodyHeight/3 - idleOffset/2, 
                           groundY - bodyHeight + 3*scale + idleOffset, 
                           limbWidth, bodyHeight/1.5 - scale);
                // Legs
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                break;
                
            case 'walk':
                // Animation cycle for walking
                const walkPhase = frameIndex / this.totalFrames;
                const stepHeight = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                
                // Draw fancy hat/helmet
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX - headSize/2 - scale*2, groundY - bodyHeight - headSize - scale*2, headSize + scale*4, scale*2);
                
                // Draw head
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw fancy outfit/armor
                ctx.fillStyle = outfitColor;
                // Shoulder pads
                ctx.fillRect(centerX - bodyHeight/3 - scale*2, groundY - bodyHeight, scale*2, scale*3);
                ctx.fillRect(centerX + bodyHeight/3, groundY - bodyHeight, scale*2, scale*3);
                // Body
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw cape/cloak with walking movement
                ctx.fillStyle = accentColor;
                const walkCapeOffset = Math.sin(walkPhase * Math.PI * 2 + Math.PI/4) * scale;
                ctx.fillRect(centerX - bodyHeight/1.2/2 + walkCapeOffset, 
                           groundY - bodyHeight + 2*scale, 
                           bodyHeight/1.2, bodyHeight - scale);
                
                // Draw limbs with walking motion
                ctx.fillStyle = skinColor;
                // Arms (swinging)
                const armSwing = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth - armSwing, 
                           groundY - bodyHeight + 3*scale, 
                           limbWidth, bodyHeight/1.5 - scale);
                ctx.fillRect(centerX + bodyHeight/3 + armSwing, 
                           groundY - bodyHeight + 3*scale, 
                           limbWidth, bodyHeight/1.5 - scale);
                
                // Legs (stepping)
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, 
                           groundY - bodyHeight/1.8 - stepHeight, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, 
                           groundY - bodyHeight/1.8 + stepHeight, 
                           limbWidth, bodyHeight/1.8);
                break;
                
            case 'attack':
                // Attack animation for fantasy character (magic cast)
                const attackPhase = frameIndex / this.totalFrames;
                let armExtension = 0;
                
                if (attackPhase < 0.3) {
                    // Wind up
                    armExtension = -attackPhase * 5 * scale;
                } else if (attackPhase < 0.6) {
                    // Cast
                    const t = (attackPhase - 0.3) / 0.3;
                    armExtension = -1.5 * scale + t * 8 * scale;
                } else {
                    // Hold
                    armExtension = 5 * scale;
                }
                
                // Draw fancy hat/helmet
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX - headSize/2 - scale*2, groundY - bodyHeight - headSize - scale*2, headSize + scale*4, scale*2);
                
                // Draw head (turned slightly)
                ctx.fillStyle = skinColor;
                ctx.fillRect(centerX - headSize/2 + scale, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw fancy outfit/armor
                ctx.fillStyle = outfitColor;
                // Shoulder pads
                ctx.fillRect(centerX - bodyHeight/3 - scale*2, groundY - bodyHeight, scale*2, scale*3);
                ctx.fillRect(centerX + bodyHeight/3, groundY - bodyHeight, scale*2, scale*3);
                // Body
                ctx.fillRect(centerX - bodyHeight/3 + scale/2, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw cape/cloak with dramatic flair during attack
                ctx.fillStyle = accentColor;
                const attackCapeWidth = bodyHeight/1.2 + attackPhase * scale * 4;
                const attackCapeOffset = Math.sin(attackPhase * Math.PI * 2 + Math.PI/4) * scale * 2;
                ctx.fillRect(centerX - attackCapeWidth/2 + attackCapeOffset, 
                           groundY - bodyHeight + 2*scale, 
                           attackCapeWidth, bodyHeight - scale);
                
                // Draw magic effect if in cast phase
                if (attackPhase >= 0.3) {
                    ctx.fillStyle = accentColor;
                    const effectSize = (attackPhase - 0.3) * 10 * scale;
                    if (effectSize > 0) {
                        ctx.beginPath();
                        ctx.arc(centerX + bodyHeight/3 + limbWidth + 6*scale, 
                               groundY - bodyHeight + 2*scale, 
                               effectSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                
                // Draw limbs
                ctx.fillStyle = skinColor;
                // Casting arm
                ctx.fillRect(centerX + bodyHeight/3 + armExtension, 
                           groundY - bodyHeight + 3*scale, 
                           limbWidth + 2*scale, limbWidth);
                
                // Other arm
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth, 
                           groundY - bodyHeight + 3*scale, 
                           limbWidth, bodyHeight/1.5 - scale);
                
                // Legs in stable position
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2 - scale, 
                           groundY - bodyHeight/1.8, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2 + scale, 
                           groundY - bodyHeight/1.8, 
                           limbWidth, bodyHeight/1.8);
                break;
                
            default:
                // Fallback to human sprite for other animations
                this.generateHumanSprite(ctx, frameIndex, size, colors);
        }
    }
    
    generateRobotSprite(ctx, frameIndex, size, colors) {
        // Choose colors for the sprite
        const primaryColor = colors[Math.floor(Math.random() * colors.length / 2)];
        const secondaryColor = colors[Math.floor(Math.random() * colors.length / 2) + colors.length / 2];
        const accentColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Scale factor based on size
        const scale = size / 32; // Normalized to 32x32 base
        
        // Body parameters
        const headSize = 7 * scale;
        const bodyHeight = 12 * scale;
        const limbWidth = 4 * scale;
        
        // Center coordinates
        const centerX = size / 2;
        const groundY = size - 4 * scale;
        
        // Draw based on animation type and frame
        switch (this.animationType) {
            case 'idle':
                // Draw slight mechanical movements
                const idleOffset = Math.sin(frameIndex / this.totalFrames * Math.PI * 2) * scale / 2;
                
                // Draw head (box-shaped)
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize + idleOffset, headSize, headSize);
                
                // Draw eyes/visor
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX - headSize/4, groundY - bodyHeight - headSize/1.5 + idleOffset, headSize/2, headSize/6);
                
                // Draw body (rectangular)
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw mechanical details on body
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyHeight/5, groundY - bodyHeight + scale*2, bodyHeight/2.5, bodyHeight/4);
                ctx.fillRect(centerX - bodyHeight/5, groundY - bodyHeight/2, bodyHeight/2.5, bodyHeight/4);
                
                // Draw limbs
                ctx.fillStyle = secondaryColor;
                // Arms (mechanical)
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth + idleOffset, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3 - idleOffset, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs (mechanical)
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                
                // Antenna
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX, groundY - bodyHeight - headSize - scale*2 + idleOffset, scale, scale*2);
                break;
                
            case 'walk':
                // Mechanical walking animation
                const walkPhase = frameIndex / this.totalFrames;
                const stepHeight = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                const bodyShift = Math.cos(walkPhase * Math.PI * 2) * scale / 2;
                
                // Draw head (with slight mechanical bob)
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - headSize/2 + bodyShift, groundY - bodyHeight - headSize + Math.abs(stepHeight/4), headSize, headSize);
                
                // Draw eyes/visor
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX - headSize/4 + bodyShift, groundY - bodyHeight - headSize/1.5 + Math.abs(stepHeight/4), headSize/2, headSize/6);
                
                // Draw body with slight shift for mechanical walking
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - bodyHeight/3 + bodyShift, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw mechanical details on body
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyHeight/5 + bodyShift, groundY - bodyHeight + scale*2, bodyHeight/2.5, bodyHeight/4);
                ctx.fillRect(centerX - bodyHeight/5 + bodyShift, groundY - bodyHeight/2, bodyHeight/2.5, bodyHeight/4);
                
                // Draw limbs with mechanical walking motion
                ctx.fillStyle = secondaryColor;
                // Arms (rotating joints)
                const armSwing = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth - armSwing + bodyShift, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3 + armSwing + bodyShift, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs (stepping with mechanical precision)
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2 + bodyShift, 
                           groundY - bodyHeight/1.8 - stepHeight, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2 + bodyShift, 
                           groundY - bodyHeight/1.8 + stepHeight, 
                           limbWidth, bodyHeight/1.8);
                
                // Antenna
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX + bodyShift, groundY - bodyHeight - headSize - scale*2 + Math.abs(stepHeight/4), scale, scale*2);
                break;
                
            case 'attack':
                // Robot attack animation (firing weapon)
                const attackPhase = frameIndex / this.totalFrames;
                const weaponExtension = attackPhase < 0.5 ? 
                                       attackPhase * 6 * scale : 
                                       3 * scale;
                
                // Draw head
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw eyes/visor (glowing when attacking)
                ctx.fillStyle = attackPhase > 0.3 && attackPhase < 0.7 ? '#ffffff' : accentColor;
                ctx.fillRect(centerX - headSize/4, groundY - bodyHeight - headSize/1.5, headSize/2, headSize/6);
                
                // Draw body (rectangular, slightly shifted for attack stance)
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - bodyHeight/3 + scale, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw mechanical details on body
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyHeight/5 + scale, groundY - bodyHeight + scale*2, bodyHeight/2.5, bodyHeight/4);
                ctx.fillRect(centerX - bodyHeight/5 + scale, groundY - bodyHeight/2, bodyHeight/2.5, bodyHeight/4);
                
                // Draw weapon arm
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX + bodyHeight/3 + weaponExtension, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth + scale, limbWidth);
                
                // Draw weapon effect when firing
                if (attackPhase > 0.5 && attackPhase < 0.8) {
                    const blastSize = (attackPhase - 0.5) * 8 * scale;
                    ctx.fillStyle = accentColor;
                    ctx.beginPath();
                    ctx.arc(centerX + bodyHeight/3 + limbWidth + weaponExtension + 4*scale, 
                           groundY - bodyHeight + 2*scale, 
                           blastSize, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // Draw other limbs
                ctx.fillStyle = secondaryColor;
                // Other arm
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth, 
                           groundY - bodyHeight + 2*scale, 
                           limbWidth, bodyHeight/1.5);
                
                // Legs in stable position
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2 - scale, 
                           groundY - bodyHeight/1.8, 
                           limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2 + scale, 
                           groundY - bodyHeight/1.8, 
                           limbWidth, bodyHeight/1.8);
                
                // Antenna
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX, groundY - bodyHeight - headSize - scale*2, scale, scale*2);
                break;
                
            default:
                // Fallback to a simple robot for other animations
                // Draw head
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - headSize/2, groundY - bodyHeight - headSize, headSize, headSize);
                
                // Draw eyes/visor
                ctx.fillStyle = accentColor;
                ctx.fillRect(centerX - headSize/4, groundY - bodyHeight - headSize/1.5, headSize/2, headSize/6);
                
                // Draw body
                ctx.fillStyle = primaryColor;
                ctx.fillRect(centerX - bodyHeight/3, groundY - bodyHeight, bodyHeight/1.5, bodyHeight);
                
                // Draw mechanical details
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyHeight/5, groundY - bodyHeight + scale*2, bodyHeight/2.5, bodyHeight/4);
                ctx.fillRect(centerX - bodyHeight/5, groundY - bodyHeight/2, bodyHeight/2.5, bodyHeight/4);
                
                // Draw limbs
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyHeight/3 - limbWidth, groundY - bodyHeight + 2*scale, limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX + bodyHeight/3, groundY - bodyHeight + 2*scale, limbWidth, bodyHeight/1.5);
                ctx.fillRect(centerX - bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
                ctx.fillRect(centerX + bodyHeight/4 - limbWidth/2, groundY - bodyHeight/1.8, limbWidth, bodyHeight/1.8);
        }
    }
    
    generateAnimalSprite(ctx, frameIndex, size, colors) {
        // Choose colors for the sprite
        const furColor = colors[Math.floor(Math.random() * colors.length / 2)];
        const secondaryColor = colors[Math.floor(Math.random() * colors.length / 2) + colors.length / 2];
        
        // Scale factor based on size
        const scale = size / 32; // Normalized to 32x32 base
        
        // Body parameters - more horizontal for animal
        const headSize = 6 * scale;
        const bodyWidth = 14 * scale;
        const bodyHeight = 8 * scale;
        const legWidth = 3 * scale;
        const legHeight = 6 * scale;
        
        // Center coordinates
        const centerX = size / 2;
        const groundY = size - 4 * scale;
        
        // Draw based on animation type and frame
        switch (this.animationType) {
            case 'idle':
                // Slight breathing motion
                const idleOffset = Math.sin(frameIndex / this.totalFrames * Math.PI * 2) * scale / 2;
                
                // Draw body
                ctx.fillStyle = furColor;
                ctx.fillRect(centerX - bodyWidth/2, groundY - bodyHeight - idleOffset, bodyWidth, bodyHeight);
                
                // Draw head
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/2 - idleOffset, 
                           headSize, headSize);
                
                // Draw ears
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/2 - scale*2 - idleOffset, 
                           scale*2, scale*2);
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale*3, 
                           groundY - bodyHeight - headSize/2 - scale*2 - idleOffset, 
                           scale*2, scale*2);
                
                // Draw legs
                ctx.fillRect(centerX - bodyWidth/2 + scale, groundY - legHeight, legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/2 - legWidth - scale, groundY - legHeight, legWidth, legHeight);
                ctx.fillRect(centerX - bodyWidth/3, groundY - legHeight, legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/3 - legWidth, groundY - legHeight, legWidth, legHeight);
                
                // Draw tail
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX + bodyWidth/2, 
                           groundY - bodyHeight - scale - idleOffset, 
                           scale*4, scale*2);
                
                // Draw face details
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/4 - idleOffset, 
                           scale, scale);
                break;
                
            case 'walk':
                // Four-legged walking animation
                const walkPhase = frameIndex / this.totalFrames;
                const frontStepHeight = Math.sin(walkPhase * Math.PI * 2) * 2 * scale;
                const backStepHeight = Math.sin((walkPhase + 0.5) * Math.PI * 2) * 2 * scale;
                
                // Draw body with slight movement
                ctx.fillStyle = furColor;
                ctx.fillRect(centerX - bodyWidth/2, groundY - bodyHeight, bodyWidth, bodyHeight);
                
                // Draw head with slight movement
                const headBob = Math.abs(frontStepHeight) / 2;
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/2 - headBob, 
                           headSize, headSize);
                
                // Draw ears
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/2 - scale*2 - headBob, 
                           scale*2, scale*2);
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale*3, 
                           groundY - bodyHeight - headSize/2 - scale*2 - headBob, 
                           scale*2, scale*2);
                
                // Draw legs with walking motion
                ctx.fillRect(centerX - bodyWidth/2 + scale, 
                           groundY - legHeight - frontStepHeight, 
                           legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/2 - legWidth - scale, 
                           groundY - legHeight + frontStepHeight, 
                           legWidth, legHeight);
                ctx.fillRect(centerX - bodyWidth/3, 
                           groundY - legHeight + backStepHeight, 
                           legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/3 - legWidth, 
                           groundY - legHeight - backStepHeight, 
                           legWidth, legHeight);
                
                // Draw tail with movement
                ctx.fillStyle = secondaryColor;
                const tailWag = Math.sin(walkPhase * Math.PI * 4) * scale;
                ctx.fillRect(centerX + bodyWidth/2, 
                           groundY - bodyHeight - scale + tailWag, 
                           scale*4, scale*2);
                
                // Draw face details
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/4 - headBob, 
                           scale, scale);
                break;
                
            case 'run':
                // Faster four-legged animation
                const runPhase = frameIndex / this.totalFrames;
                const runFrontStep = Math.sin(runPhase * Math.PI * 2) * 3 * scale;
                const runBackStep = Math.sin((runPhase + 0.5) * Math.PI * 2) * 3 * scale;
                const stretchFactor = Math.sin(runPhase * Math.PI) * scale;
                
                // Draw stretched body when running
                ctx.fillStyle = furColor;
                ctx.fillRect(centerX - bodyWidth/2 - stretchFactor, 
                           groundY - bodyHeight, 
                           bodyWidth + stretchFactor*2, bodyHeight);
                
                // Draw head leaning forward when running
                const runHeadBob = Math.abs(runFrontStep) / 2;
                ctx.fillRect(centerX - bodyWidth/2 - headSize, 
                           groundY - bodyHeight - headSize/2 - runHeadBob, 
                           headSize, headSize);
                
                // Draw ears flowing back
                ctx.fillRect(centerX - bodyWidth/2 - headSize, 
                           groundY - bodyHeight - headSize/2 - scale*2 - runHeadBob, 
                           scale*2, scale*2);
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale*2, 
                           groundY - bodyHeight - headSize/2 - scale*2 - runHeadBob, 
                           scale*2, scale*2);
                
                // Draw legs with exaggerated running motion
                ctx.fillRect(centerX - bodyWidth/2 + scale, 
                           groundY - legHeight - runFrontStep, 
                           legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/2 - legWidth - scale, 
                           groundY - legHeight + runFrontStep, 
                           legWidth, legHeight);
                ctx.fillRect(centerX - bodyWidth/3, 
                           groundY - legHeight + runBackStep, 
                           legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/3 - legWidth, 
                           groundY - legHeight - runBackStep, 
                           legWidth, legHeight);
                
                // Draw tail flowing back
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX + bodyWidth/2, 
                           groundY - bodyHeight, 
                           scale*5, scale*2);
                
                // Draw face details
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyWidth/2 - headSize, 
                           groundY - bodyHeight - headSize/4 - runHeadBob, 
                           scale, scale);
                break;
                
            case 'jump':
                // Jump animation
                let jumpY = 0;
                if (frameIndex < this.totalFrames / 4) {
                    // Crouch phase
                    jumpY = 0;
                } else if (frameIndex < this.totalFrames / 2) {
                    // Rise phase
                    const t = (frameIndex - this.totalFrames / 4) / (this.totalFrames / 4);
                    jumpY = -scale * 8 * t;
                } else if (frameIndex < 3 * this.totalFrames / 4) {
                    // Peak phase
                    jumpY = -scale * 8;
                } else {
                    // Fall phase
                    const t = (frameIndex - 3 * this.totalFrames / 4) / (this.totalFrames / 4);
                    jumpY = -scale * 8 * (1-t);
                }
                
                // Pre-jump crouch or landing pose
                const crouchFactor = (frameIndex < this.totalFrames / 4 || frameIndex > 3 * this.totalFrames / 4) ? scale : 0;
                
                // Draw body
                ctx.fillStyle = furColor;
                ctx.fillRect(centerX - bodyWidth/2, 
                           groundY - bodyHeight + crouchFactor + jumpY, 
                           bodyWidth, bodyHeight - crouchFactor);
                
                // Draw head
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/2 + crouchFactor/2 + jumpY, 
                           headSize, headSize);
                
                // Draw ears
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/2 - scale*2 + crouchFactor/2 + jumpY, 
                           scale*2, scale*2);
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale*3, 
                           groundY - bodyHeight - headSize/2 - scale*2 + crouchFactor/2 + jumpY, 
                           scale*2, scale*2);
                
                // Draw legs (tucked during jump)
                if (jumpY < -scale) {
                    // Tucked legs during jump
                    ctx.fillRect(centerX - bodyWidth/2 + scale, 
                               groundY - legHeight/2 + jumpY, 
                               legWidth, legHeight/2);
                    ctx.fillRect(centerX + bodyWidth/2 - legWidth - scale, 
                               groundY - legHeight/2 + jumpY, 
                               legWidth, legHeight/2);
                    ctx.fillRect(centerX - bodyWidth/3, 
                               groundY - legHeight/2 + jumpY, 
                               legWidth, legHeight/2);
                    ctx.fillRect(centerX + bodyWidth/3 - legWidth, 
                               groundY - legHeight/2 + jumpY, 
                               legWidth, legHeight/2);
                } else {
                    // Extended legs during crouch/landing
                    ctx.fillRect(centerX - bodyWidth/2 + scale, 
                               groundY - legHeight + crouchFactor, 
                               legWidth, legHeight);
                    ctx.fillRect(centerX + bodyWidth/2 - legWidth - scale, 
                               groundY - legHeight + crouchFactor, 
                               legWidth, legHeight);
                    ctx.fillRect(centerX - bodyWidth/3, 
                               groundY - legHeight + crouchFactor, 
                               legWidth, legHeight);
                    ctx.fillRect(centerX + bodyWidth/3 - legWidth, 
                               groundY - legHeight + crouchFactor, 
                               legWidth, legHeight);
                }
                
                // Draw tail
                ctx.fillStyle = secondaryColor;
                const jumpTailAngle = (jumpY < 0) ? scale*2 : 0;
                ctx.fillRect(centerX + bodyWidth/2, 
                           groundY - bodyHeight - jumpTailAngle + jumpY, 
                           scale*4, scale*2);
                
                // Draw face details
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, 
                           groundY - bodyHeight - headSize/4 + crouchFactor/2 + jumpY, 
                           scale, scale);
                break;
                
            default:
                // Basic animal sprite as fallback
                ctx.fillStyle = furColor;
                ctx.fillRect(centerX - bodyWidth/2, groundY - bodyHeight, bodyWidth, bodyHeight);
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, groundY - bodyHeight - headSize/2, headSize, headSize);
                ctx.fillRect(centerX - bodyWidth/2 + scale, groundY - legHeight, legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/2 - legWidth - scale, groundY - legHeight, legWidth, legHeight);
                ctx.fillRect(centerX - bodyWidth/3, groundY - legHeight, legWidth, legHeight);
                ctx.fillRect(centerX + bodyWidth/3 - legWidth, groundY - legHeight, legWidth, legHeight);
                
                ctx.fillStyle = secondaryColor;
                ctx.fillRect(centerX + bodyWidth/2, groundY - bodyHeight - scale, scale*4, scale*2);
                ctx.fillRect(centerX - bodyWidth/2 - headSize + scale, groundY - bodyHeight - headSize/4, scale, scale);
        }
    }
    
    startAnimation() {
        this.isAnimating = true;
        document.getElementById('play-pause-icon').textContent = '⏸️';
        this.animate();
    }
    
    stopAnimation() {
        this.isAnimating = false;
        document.getElementById('play-pause-icon').textContent = '▶️';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    toggleAnimation() {
        if (this.sprites.length === 0) return;
        
        if (this.isAnimating) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
    }
    
    animate() {
        if (!this.isAnimating) return;
        
        const frameTime = 1000 / this.animationSpeed;
        const now = Date.now();
        
        if (!this.lastFrameTime || now - this.lastFrameTime >= frameTime) {
            this.lastFrameTime = now;
            this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
            this.renderCurrentFrame();
            
            // Update slider
            const frameSlider = document.getElementById('frame-slider');
            frameSlider.value = (this.currentFrame / (this.totalFrames - 1)) * 100;
        }
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    renderCurrentFrame() {
        if (this.sprites.length === 0 || this.currentFrame >= this.sprites.length) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw current frame
        const sprite = this.sprites[this.currentFrame];
        const scale = this.canvas.width / sprite.width;
        
        this.ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
        this.ctx.drawImage(sprite, 0, 0, this.canvas.width, this.canvas.height);
    }
    
    exportSpritesheet() {
        if (this.sprites.length === 0) return;
        
        // Create a canvas for the spritesheet
        const spriteSize = this.pixelSizes[this.pixelStyle];
        const canvas = document.createElement('canvas');
        canvas.width = spriteSize * this.totalFrames;
        canvas.height = spriteSize;
        const ctx = canvas.getContext('2d');
        
        // Draw each frame side by side
        for (let i = 0; i < this.totalFrames; i++) {
            ctx.drawImage(this.sprites[i], i * spriteSize, 0);
        }
        
        // Convert to data URL and trigger download
        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${this.characterType}-${this.animationType}-${this.pixelStyle}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const generator = new PixelSpriteGenerator();
});