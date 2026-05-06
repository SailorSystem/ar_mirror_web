/**
 * section-antigravedad.js — Física real con Matter.js + MediaPipe HandLandmarker
 *
 * ✊ PUÑO  → agarra la bola más cercana y atrae las demás
 * 🖐 ABIERTA → suelta + repulsión explosiva + antigravedad fuerte
 * Sin mano   → gravedad normal, bolas caen
 */

import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

let running     = false;
let animFrameId = null;
let handLandmarker;
let engine, world;
let balls   = [];
let grabbed = null;   // { body, handIdx }
let W = 1280, H = 720;

const PUCE_PALETTE = [
    "#003366","#003366","#003F7F",
    "#C8A951","#C8A951","#D4B86A",
    "#FFFFFF","#E8E8E8",
];
const BALL_COUNT = 18;

// ─── Cargar Matter.js desde CDN ───────────────────────────────────────────────
async function loadMatter() {
    if (window.Matter) return;
    await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src   = "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js";
        s.onload  = res;
        s.onerror = rej;
        document.head.appendChild(s);
    });
}

// ─── Setup mundo físico ───────────────────────────────────────────────────────
function setupWorld(w, h) {
    W = w; H = h;
    const { Engine, World, Bodies } = Matter;
    engine = Engine.create();
    world  = engine.world;
    engine.gravity.y = 1;

    const walls = [
        Bodies.rectangle(W/2, H+25,  W,   50, { isStatic:true }),
        Bodies.rectangle(W/2, -25,   W,   50, { isStatic:true }),
        Bodies.rectangle(-25, H/2,   50,  H,  { isStatic:true }),
        Bodies.rectangle(W+25,H/2,   50,  H,  { isStatic:true }),
    ];
    World.add(world, walls);

    balls = [];
    for (let i = 0; i < BALL_COUNT; i++) {
        const r    = 22 + Math.random() * 20;
        const body = Bodies.circle(
            r + Math.random() * (W - r*2),
            r + Math.random() * (H * 0.5),
            r,
            { restitution:0.65, friction:0.04, density:0.002 }
        );
        body._color  = PUCE_PALETTE[i % PUCE_PALETTE.length];
        body._r      = r;
        body._glow   = 0;
        balls.push(body);
        World.add(world, body);
    }
}

// ─── Helpers de gesto ────────────────────────────────────────────────────────
function gesture(lm) {
    const up = (t,p) => lm[t].y < lm[p].y;
    const n  = [up(8,6),up(12,10),up(16,14),up(20,18)].filter(Boolean).length;
    return n === 0 ? "fist" : n >= 3 ? "open" : "neutral";
}
function palm(lm) {
    return { x:((lm[0].x+lm[9].x)/2)*W, y:((lm[0].y+lm[9].y)/2)*H };
}
function closest(px, py) {
    let best=null, bd=Infinity;
    balls.forEach(b=>{
        const d=Math.hypot(b.position.x-px,b.position.y-py);
        if(d<bd && d<120+b._r){bd=d;best=b;}
    });
    return best;
}

// ─── Init ────────────────────────────────────────────────────────────────────
export async function initAntigravedad() {
    await loadMatter();
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions:{ modelAssetPath:"public/models/hand_landmarker.task", delegate:"GPU" },
        runningMode:"VIDEO", numHands:2,
    });

    const cv = document.getElementById("output_canvas");
    setupWorld(cv.width||1280, cv.height||720);
    running = true;
    render();
}

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
    if (!running) return;
    animFrameId = requestAnimationFrame(render);

    const video  = document.getElementById("webcam");
    const canvas = document.getElementById("output_canvas");
    const ctx    = canvas.getContext("2d");
    if (video.readyState < 4) return;

    // Sincronizar tamaño si cambió
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        if (engine) { Matter.World.clear(world); Matter.Engine.clear(engine); }
        setupWorld(video.videoWidth, video.videoHeight);
    }

    const result = handLandmarker.detectForVideo(video, performance.now());
    const hands  = (result.landmarks||[]).map((lm,idx)=>({
        lm, idx, g:gesture(lm), p:palm(lm),
    }));

    ctx.clearRect(0,0,W,H);
    balls.forEach(b=>{ if(b._glow>0) b._glow-=0.04; });

    // ── Física por gesto ─────────────────────────────────────────────────────
    let hasFist=false, hasOpen=false;
    hands.forEach(({g, p, idx})=>{
        if (g==="fist") {
            hasFist=true;
            if (!grabbed) {
                const t=closest(p.x,p.y);
                if (t) { grabbed={body:t,handIdx:idx}; t._glow=1; }
            }
            if (grabbed && grabbed.handIdx===idx) {
                const b=grabbed.body, dx=p.x-b.position.x, dy=p.y-b.position.y;
                Matter.Body.setVelocity(b,{x:dx*0.3,y:dy*0.3});
                b._glow=1;
            }
            balls.forEach(b=>{
                if(grabbed&&b===grabbed.body) return;
                const dx=p.x-b.position.x, dy=p.y-b.position.y;
                const d2=Math.max(400,dx*dx+dy*dy);
                Matter.Body.applyForce(b,b.position,{x:dx/d2*0.06,y:dy/d2*0.06});
            });
        } else if (g==="open") {
            hasOpen=true;
            if (grabbed&&grabbed.handIdx===idx) grabbed=null;
            balls.forEach(b=>{
                const dx=b.position.x-p.x, dy=b.position.y-p.y;
                const d2=Math.max(400,dx*dx+dy*dy);
                Matter.Body.applyForce(b,b.position,{x:dx/d2*0.14,y:dy/d2*0.14});
            });
        }
    });

    // Soltar si la mano desapareció
    if (grabbed && !hands.find(h=>h.idx===grabbed.handIdx)) grabbed=null;

    // Gravedad dinámica
    engine.gravity.y = hasFist ? -0.25 : hasOpen ? -0.9 : hands.length>0 ? 0 : 1;

    Matter.Engine.update(engine, 1000/60);

    // ── Render partículas ────────────────────────────────────────────────────
    // Líneas de conexión
    for(let a=0;a<balls.length;a++) for(let b=a+1;b<balls.length;b++){
        const ba=balls[a],bb=balls[b];
        const d=Math.hypot(ba.position.x-bb.position.x,ba.position.y-bb.position.y);
        if(d<150){
            const al=(1-d/150)*0.28;
            ctx.beginPath();
            ctx.moveTo(W-ba.position.x,ba.position.y);
            ctx.lineTo(W-bb.position.x,bb.position.y);
            ctx.strokeStyle=`rgba(200,169,81,${al})`;
            ctx.lineWidth=1.2;
            ctx.stroke();
        }
    }

    // Bolas
    const t=performance.now()*0.001;
    balls.forEach((b,bi)=>{
        const px=W-b.position.x, py=b.position.y;
        const isG=grabbed&&grabbed.body===b;
        const pulse=1+0.12*Math.sin(t*2+bi);

        ctx.save();
        ctx.translate(px,py);
        ctx.rotate(-b.angle);  // espejo invierte la rotación visual

        if(isG||b._glow>0.1){
            ctx.shadowColor=b._color;
            ctx.shadowBlur=35*(isG?1:b._glow);
        }

        const g2=ctx.createRadialGradient(-b._r*0.3,-b._r*0.3,b._r*0.08,0,0,b._r*pulse);
        g2.addColorStop(0,lighten(b._color,70));
        g2.addColorStop(1,b._color);
        ctx.beginPath();
        ctx.arc(0,0,b._r*pulse,0,Math.PI*2);
        ctx.fillStyle=g2;
        ctx.fill();
        ctx.strokeStyle=isG?"#C8A951":"rgba(255,255,255,0.15)";
        ctx.lineWidth=isG?3:1;
        ctx.stroke();
        ctx.restore();
    });

    // HUD
    drawHUD(ctx,hands);
}

function drawHUD(ctx,hands){
    ctx.save();
    ctx.font="bold 19px 'Segoe UI',sans-serif";
    ctx.textBaseline="top"; ctx.textAlign="left";
    if(!hands.length){
        ctx.fillStyle="rgba(200,169,81,0.7)";
        ctx.fillText("✋  Acerca una mano para interactuar",20,20);
    } else {
        hands.forEach((h,i)=>{
            const [txt,col]=h.g==="fist"
                ?["✊  Agarrando — puño para atraer","#C8A951"]
                :h.g==="open"
                ?["🖐  Mano abierta — dispersando","#00ff88"]
                :["🤚  Neutral","#ffffff"];
            ctx.fillStyle=col;
            ctx.fillText(txt,20,20+i*30);
        });
    }
    ctx.textAlign="right"; ctx.fillStyle="rgba(200,169,81,0.5)";
    ctx.font="14px 'Segoe UI',sans-serif";
    ctx.fillText("PUCE · Matter.js + MediaPipe",W-16,20);
    ctx.restore();
}

function lighten(hex,amt){
    const n=parseInt(hex.replace("#",""),16);
    return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
}

export function stopAntigravedad(){
    running=false;
    if(animFrameId) cancelAnimationFrame(animFrameId);
    if(engine){ Matter.World.clear(world); Matter.Engine.clear(engine); }
    grabbed=null; balls=[];
}