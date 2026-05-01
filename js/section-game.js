import { FaceLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

// Configuración del Juego
let faceLandmarker;
let running = false;
let isGameOver = false; // Control de estado para el menú
let canvas, ctx;
let frameCount = 0;
let score = 0;

// Entidades
let bird = { x: 100, y: 300, w: 45, h: 35, img: new Image() };
let pipes = [];
const pipeSettings = { width: 60, gap: 160, speed: 3.5 };

// Texturas
bird.img.src = 'assets/textures/bluebird-upflap.png';
const pipeImg = new Image(); pipeImg.src = 'assets/textures/pipe-green.png';
const baseImg = new Image(); baseImg.src = 'assets/textures/base.png';

export async function initFlappyGame() {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { 
            modelAssetPath: "public/models/face_landmarker.task", 
            delegate: "GPU" 
        },
        runningMode: "VIDEO",
        numFaces: 1
    });

    canvas = document.getElementById("output_canvas");
    ctx = canvas.getContext("2d");
    
    // Configurar el botón de reiniciar del index.html
    // CONFIGURACIÓN DEL BOTÓN DE REINICIO
    document.getElementById('restart-btn').onclick = () => {
        if (isGameOver) {
            resetGame(); // Limpia variables y oculta el menú[cite: 11]
            animate();   // ¡ESTA ES LA CLAVE! Reactiva el bucle de dibujo[cite: 11]
        }
    };

    resetGame();
    running = true;
    animate();
}

function resetGame() {
    score = 0;
    pipes = [];
    frameCount = 0;
    bird.y = 300;
    isGameOver = false;
    document.getElementById('game-over-screen').classList.add('hidden'); // Ocultar menú
}

function showGameOver() {
    isGameOver = true;
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over-screen').classList.remove('hidden'); // Mostrar menú
}

function animate() {
    if (!running || isGameOver) return; 
    
    const video = document.getElementById("webcam");
    if (video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const results = faceLandmarker.detectForVideo(video, performance.now());
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Control por Nariz (Ya funciona bien con nose.x directo + CSS espejo)
        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const nose = results.faceLandmarks[0][1]; 
            const targetX = nose.x * canvas.width; 
            const targetY = nose.y * canvas.height;

            bird.y += (targetY - bird.y) * 0.25;
            bird.x = targetX;
        }

        // 2. Lógica de Tuberías: INVERTIDA para compensar el espejo CSS
        if (frameCount % 90 === 0) {
            const minHeight = 50;
            const maxHeight = canvas.height - pipeSettings.gap - minHeight - 50;
            const randomY = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
            
            // Aparecen en X = 0 (que por el espejo es la derecha visual)
            pipes.push({ x: 0 - pipeSettings.width, y: randomY, passed: false });
        }

        // 3. Dibujar y Actualizar Tuberías
        for (let i = pipes.length - 1; i >= 0; i--) {
            let p = pipes[i];
            
            // Sumamos velocidad en lugar de restar para que viajen hacia el otro lado
            p.x += pipeSettings.speed; 

            // Dibujo de Tubería Superior
            ctx.save();
            ctx.translate(p.x + pipeSettings.width / 2, p.y);
            ctx.scale(1, -1);
            ctx.drawImage(pipeImg, -pipeSettings.width / 2, 0, pipeSettings.width, p.y);
            ctx.restore();

            // Dibujo de Tubería Inferior
            ctx.drawImage(pipeImg, p.x, p.y + pipeSettings.gap, pipeSettings.width, canvas.height - (p.y + pipeSettings.gap));

            // Colisiones
            if (checkCollision(p)) {
                showGameOver();
                return;
            }

            // Puntuación corregida para el nuevo sentido del movimiento
            if (!p.passed && p.x > bird.x) {
                score++;
                p.passed = true;
            }

            // Eliminar si salen del canvas por el lado opuesto
            if (p.x > canvas.width) pipes.splice(i, 1);
        }

        // 4. Dibujar Suelo y Personaje
        ctx.drawImage(baseImg, 0, canvas.height - 40, canvas.width, 40);
        
        // Pájaro con escala invertida para que mire al frente
        ctx.save();
        ctx.translate(bird.x, bird.y); 
        ctx.scale(-1, 1); 
        ctx.drawImage(bird.img, -bird.w/2, -bird.h/2, bird.w, bird.h);
        ctx.restore();

        // UI de Puntos (Invertida manualmente para que sea legible en el espejo)
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        ctx.font = "bold 40px Arial";
        ctx.strokeText(`Puntos: ${score}`, 20, 60);
        ctx.fillText(`Puntos: ${score}`, 20, 60);
        ctx.restore();

        frameCount++;
    }
    
    requestAnimationFrame(animate);
}

function checkCollision(p) {
    const hitbox = 10;
    const birdLeft = bird.x - bird.w/2 + hitbox;
    const birdRight = bird.x + bird.w/2 - hitbox;
    const birdTop = bird.y - bird.h/2 + hitbox;
    const birdBottom = bird.y + bird.h/2 - hitbox;

    if (birdRight > p.x && birdLeft < p.x + pipeSettings.width) {
        if (birdTop < p.y || birdBottom > p.y + pipeSettings.gap) {
            return true;
        }
    }
    return birdBottom > canvas.height - 40;
}

export function stopFlappyGame() {
    running = false;
    document.getElementById('game-over-screen').classList.add('hidden');
}