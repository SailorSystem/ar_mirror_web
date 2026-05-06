/**
 * section-senias.js — Traductor LSEC con orientación de mano y panel dual
 *
 * Panel VERDE  → Alfabeto dactilológico (letras A-Z, números)
 * Panel NARANJA → Gestos / expresiones (Hola, Adiós, Gracias, etc.)
 *
 * Mejoras sobre versión anterior:
 *  - Se detecta orientación de la mano (muñeca arriba/abajo, palma/dorso)
 *    para distinguir letras que se parecen pero se hacen en distinta posición.
 *  - GestureRecognizer corre en paralelo para saludos y expresiones.
 *  - Debounce de 400ms para evitar parpadeo entre letras similares.
 */

import {
    HandLandmarker,
    GestureRecognizer,
    FilesetResolver,
    DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let handLandmarker, gestureRecognizer;
let running = false;
let canvas, ctx, drawingUtils;

// Debounce por mano
const lastLetter  = { Left:"", Right:"" };
const lastGesture = { Left:"", Right:"" };
const letterTs    = { Left:0,  Right:0  };
const DEBOUNCE_MS = 350;

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initSenias() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions:{ modelAssetPath:"public/models/hand_landmarker.task", delegate:"GPU" },
        runningMode:"VIDEO", numHands:2,
    });
    try {
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions:{ modelAssetPath:"public/models/gesture_recognizer.task", delegate:"GPU" },
            runningMode:"VIDEO", numHands:2,
        });
    } catch(_){ gestureRecognizer=null; }

    canvas = document.getElementById("output_canvas");
    ctx    = canvas.getContext("2d");
    drawingUtils = new DrawingUtils(ctx);
    running = true;
    render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(){
    if(!running) return;
    const video=document.getElementById("webcam");
    if(video.readyState===4){
        canvas.width=video.videoWidth;
        canvas.height=video.videoHeight;
        const now=performance.now();
        const hr=handLandmarker.detectForVideo(video,now);
        const gr=gestureRecognizer?gestureRecognizer.recognizeForVideo(video,now):null;
        ctx.clearRect(0,0,canvas.width,canvas.height);

        const letters=[], gestures=[];

        if(hr.landmarks?.length){
            hr.landmarks.forEach((lm,idx)=>{
                drawingUtils.drawConnectors(lm,HandLandmarker.HAND_CONNECTIONS,{color:"#00FF88",lineWidth:3});
                drawingUtils.drawLandmarks(lm,{color:"#FFF",lineWidth:1,radius:2});

                const lado=hr.handedness?.[idx]?.[0]?.categoryName==="Left"?"Izquierda":"Derecha";
                const key =lado==="Izquierda"?"Left":"Right";

                // Letra (alfabeto LSEC)
                const letra=lsecAlphabet(lm);
                const ts=now-letterTs[key];
                if(letra!==lastLetter[key]||ts>DEBOUNCE_MS){
                    lastLetter[key]=letra; letterTs[key]=now;
                }
                letters.push(`${lado}: ${lastLetter[key]}`);

                // Gesto / expresión
                let gest=null;
                if(gr?.gestures?.[idx]?.[0]){
                    gest=mapGesture(gr.gestures[idx][0].categoryName);
                }
                if(!gest) gest=lsecPhrase(lm);
                if(gest&&gest!==lastGesture[key]) lastGesture[key]=gest;
                if(lastGesture[key]) gestures.push(`${lado}: ${lastGesture[key]}`);
            });
        }

        drawPanel(letters,  120, "#00ff88", "rgba(0,60,20,0.65)",  "Alfabeto LSEC");
        if(gestures.length)
            drawPanel(gestures, 200, "#ff9900", "rgba(60,30,0,0.65)",  "Gestos / Expresiones");
    }
    requestAnimationFrame(render);
}

// ─── Panel de texto ───────────────────────────────────────────────────────────
function drawPanel(lines, yBase, textColor, bgColor, label){
    if(!lines.length) return;
    ctx.save();
    ctx.scale(-1,1); ctx.translate(-canvas.width,0);
    const W=canvas.width, text=lines.join("   |   ");
    ctx.font="bold 24px 'Segoe UI',sans-serif";
    ctx.textAlign="center"; ctx.textBaseline="middle";
    const tw=Math.min(ctx.measureText(text).width+56, W-40);
    const th=50, bx=W/2-tw/2, by=yBase-th/2;
    ctx.fillStyle=bgColor;
    ctx.strokeStyle=textColor; ctx.lineWidth=2;
    rrect(ctx,bx,by,tw,th,13); ctx.fill(); ctx.stroke();
    ctx.fillStyle=textColor;
    ctx.fillText(text,W/2,yBase);
    ctx.font="12px 'Segoe UI',sans-serif";
    ctx.fillStyle="rgba(255,255,255,0.4)";
    ctx.fillText(label,W/2,yBase+th/2+14);
    ctx.restore();
}

// ─── Orientación de mano ──────────────────────────────────────────────────────
/**
 * Devuelve información de orientación:
 *  palmUp   : la palma mira hacia la cámara (nudillos lejos del observador)
 *  wristUp  : la muñeca está más arriba que los dedos medios
 *  horizontal: la mano está girada lateralmente
 */
function orientation(lm){
    // Muñeca (0) vs base del dedo medio (9)
    const wristY  = lm[0].y;
    const midBaseY= lm[9].y;
    const wristX  = lm[0].x;
    const midBaseX= lm[9].x;

    // palmUp: z de la muñeca vs los nudillos (negativo = hacia la cámara en MP)
    const palmUp = (lm[0].z||0) > (lm[9].z||0);

    return {
        palmUp,
        wristUp:   wristY < midBaseY,         // muñeca apunta arriba
        handRight: wristX < midBaseX,          // mano apunta a la derecha
        angle:     Math.atan2(midBaseY-wristY, midBaseX-wristX),
    };
}

// ─── Alfabeto LSEC ────────────────────────────────────────────────────────────
function lsecAlphabet(lm){
    const up   = (t,p)=>lm[t].y<lm[p].y;
    const dist = (a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);

    const i=up(8,6), m=up(12,10), r=up(16,14), p=up(20,18);
    const ori=orientation(lm);

    // Pulgar
    const thumbSide  = Math.abs(lm[4].x-lm[2].x)>0.05;
    const thumbUp    = lm[4].y<lm[3].y;
    const t = thumbSide||thumbUp;

    // Distancias útiles
    const d48=dist(4,8), d412=dist(4,12), d416=dist(4,16), d420=dist(4,20);
    const pinchI=d48<0.07, pinchM=d412<0.07;
    const contacto45=dist(4,5)<0.08;  // pulgar sobre base índice

    // ── Letras con orientación específica ────────────────────────────────────

    // A — puño, pulgar lateral sobre el costado
    if(!i&&!m&&!r&&!p&&contacto45) return "A";

    // E — puño sin pulgar lateral (dedos curvados hacia la palma)
    if(!i&&!m&&!r&&!p&&!thumbSide&&d48>0.08) return "E";

    // S — puño con pulgar encima de los dedos
    if(!i&&!m&&!r&&!p&&lm[4].x>lm[8].x-0.02&&!thumbSide) return "S";

    // B — todos extendidos, pulgar doblado, palma al frente
    if(i&&m&&r&&p&&!t) return "B";

    // C — curvada en arco, dedos semiflexionados
    if(i&&!m&&!r&&p&&!t&&dist(8,20)>0.14) return "C";

    // D — índice extendido, resto en pinza con pulgar
    if(i&&!m&&!r&&!p&&pinchM) return "D";

    // F — pinza índice-pulgar, otros extendidos
    if(!i&&m&&r&&p&&pinchI) return "F";

    // G — índice horizontal apuntando, muñeca horizontal
    if(i&&!m&&!r&&!p&&!t&&!ori.wristUp&&Math.abs(ori.angle)<0.5) return "G";

    // H — índice y medio juntos horizontalmente
    if(i&&m&&!r&&!p&&!t&&Math.abs(lm[8].y-lm[12].y)<0.035&&!ori.wristUp) return "H";

    // I — solo meñique
    if(!i&&!m&&!r&&p&&!t) return "I";

    // K — índice y medio en V abierta, pulgar entre ellos
    if(i&&m&&!r&&!p&&dist(8,12)>0.09&&d412<0.10) return "K";

    // L — índice + pulgar en L
    if(i&&!m&&!r&&!p&&thumbSide&&lm[4].y>lm[8].y) return "L";

    // M — tres dedos sobre el pulgar (índice+medio+anular bajos)
    if(!i&&!m&&!r&&!p&&dist(4,9)<0.09) return "M";

    // N — índice+medio sobre el pulgar
    if(!i&&!m&&!r&&!p&&!contacto45&&dist(4,6)<0.09) return "N";

    // Ñ — similar a N pero con meñique levantado
    if(!i&&!m&&!r&&p&&dist(4,9)<0.10) return "Ñ";

    // O — todos forman círculo
    if(!i&&!m&&!r&&!p&&pinchI&&dist(8,20)<0.13) return "O";

    // P — índice y pulgar apuntan hacia abajo
    if(i&&!m&&!r&&!p&&thumbSide&&lm[8].y>lm[5].y+0.04) return "P";

    // Q — pinza apuntando hacia abajo
    if(pinchI&&!m&&!r&&!p&&lm[8].y>lm[5].y+0.04) return "Q";

    // R — índice y medio cruzados muy juntos
    if(i&&m&&!r&&!p&&!t&&dist(8,12)<0.045) return "R";

    // RR — índice y medio juntos pero con espacio
    if(i&&m&&!r&&!p&&!t&&dist(8,12)>0.045&&dist(8,12)<0.10) return "RR";

    // T — índice doblado, pulgar entre índice-medio
    if(!i&&!m&&!r&&!p&&dist(4,7)<0.09) return "T";

    // U — índice y medio muy juntos verticales
    if(i&&m&&!r&&!p&&!t&&dist(8,12)<0.04&&ori.wristUp) return "U";

    // V — índice y medio en V separados CON muñeca hacia arriba
    // (Diferencia clave con H: orientación vertical)
    if(i&&m&&!r&&!p&&!t&&dist(8,12)>0.06&&ori.wristUp) return "V / 2";

    // CH — índice y medio extendidos, separados, sin orientación H
    if(i&&m&&!r&&!p&&!t&&dist(8,12)>0.07&&!ori.wristUp) return "CH";

    // W — índice, medio, anular
    if(i&&m&&r&&!p&&!t) return "W / 3";

    // X — índice curvado en gancho
    if(!i&&!m&&!r&&!p&&!t&&lm[8].y<lm[6].y&&lm[8].y>lm[5].y) return "X";

    // Y / J — meñique + pulgar (cuernos)
    if(!i&&!m&&!r&&p&&t) return ori.wristUp?"Y":"J";

    // Z — índice solo (resto cerrado)
    if(i&&!m&&!r&&!p&&!t) return "Z / 1";

    // Números extra
    if(i&&m&&r&&p&&t)   return "5";
    if(i&&m&&r&&p&&!t)  return "4";
    if(pinchI&&m&&r&&p) return "F / OK";

    return "·";
}

// ─── Señas de palabras / expresiones ─────────────────────────────────────────
/**
 * Detecta configuraciones que corresponden a palabras del glosario LSEC.
 * Son señas estáticas — las que requieren movimiento se aproximan por posición.
 */
function lsecPhrase(lm){
    const up   = (t,p)=>lm[t].y<lm[p].y;
    const dist = (a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);
    const ori  = orientation(lm);

    const i=up(8,6),m=up(12,10),r=up(16,14),p=up(20,18);
    const d48=dist(4,8);

    // Hola — mano abierta que se abre y cierra (capturamos mano abierta en zona alta)
    if(i&&m&&r&&p&&!ori.wristUp&&lm[9].y<0.45) return "HOLA 👋";

    // Adiós — mano desde frente hacia afuera (aproximación: mano abierta lateral)
    if(i&&m&&r&&p&&ori.handRight&&lm[9].y<0.5) return "ADIÓS";

    // Gracias — mano toca el mentón y se separa
    // Aproximación: dedos extendidos apuntando hacia abajo, mano baja
    if(i&&m&&r&&p&&!ori.wristUp&&lm[9].y>0.55) return "GRACIAS 🙏";

    // Por favor — círculo en el pecho (solo meñique visible en movimiento)
    if(!i&&!m&&!r&&!p&&dist(4,5)<0.06&&lm[9].y>0.5) return "POR FAVOR";

    // Buenos días — mano baja desde la frente
    if(i&&m&&r&&p&&lm[8].y<0.35&&ori.wristUp) return "BUENOS DÍAS ☀️";

    // Sí — puño que baja (aproximamos como puño en zona media-baja)
    if(!i&&!m&&!r&&!p&&lm[9].y>0.5&&lm[9].y<0.75) return "SÍ ✓";

    // No — índice que se mueve (aproximamos como índice solo lateralmente)
    if(i&&!m&&!r&&!p&&!ori.wristUp) return "NO ✗";

    // Ayuda — manos juntas empujando (mano abierta apuntando arriba)
    if(i&&m&&r&&p&&ori.wristUp&&lm[9].y>0.45) return "AYUDA";

    // Lengua de señas — manos alternadas (una mano: movimiento continuo)
    if(i&&m&&!r&&!p&&dist(8,12)<0.06) return "LENGUA DE SEÑAS";

    return null;
}

// ─── GestureRecognizer → LSEC ────────────────────────────────────────────────
function mapGesture(cat){
    return {
        "Thumb_Up":   "BIEN / GRACIAS 👍",
        "Victory":    "V / 2 ✌",
        "Open_Palm":  "HOLA / B 🖐",
        "Closed_Fist":"A / E / S ✊",
        "Pointing_Up":"1 / Z ☝",
        "ILoveYou":   "TE QUIERO / Y 🤟",
    }[cat]||null;
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function rrect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
}

export function stopSenias(){ running=false; }