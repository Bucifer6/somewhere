const canvas = document.querySelector("#map");
const ctx = canvas.getContext("2d");
let world = null;
let frame = 0;
function rand(n){const x=Math.sin(n*83.71+7.13)*43758.5453;return x-Math.floor(x);}
const trees=Array.from({length:165},(_,i)=>({x:30+rand(i*3)*940,y:30+rand(i*3+1)*510,s:8+rand(i*3+2)*15})).filter(t=>Math.hypot(t.x-500,t.y-290)>135);
function ellipse(x,y,rx,ry,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function cabin(x,y,c){ctx.fillStyle="#3f544b";ctx.fillRect(x-24,y-5,48,37);ctx.fillStyle=c;ctx.fillRect(x-23,y-10,46,37);ctx.fillStyle="#6b473b";ctx.beginPath();ctx.moveTo(x-32,y-10);ctx.lineTo(x,y-39);ctx.lineTo(x+32,y-10);ctx.closePath();ctx.fill();ctx.fillStyle="#ffe6a2";ctx.fillRect(x+6,y+3,10,12);ctx.fillStyle="#534339";ctx.fillRect(x-14,y+9,12,18);}
function draw(){
 frame++;ctx.fillStyle="#81b5a6";ctx.fillRect(0,0,1000,560);
 ellipse(500,295,480,250,"#749d7b");ellipse(500,295,460,233,"#9ab989");
 ellipse(175,430,155,70,"#5e9ea3");ellipse(175,430,133,55,"#84c0bc");
 ellipse(505,285,155,115,"#c5b588");
 trees.forEach(t=>{ellipse(t.x+4,t.y+8,t.s*.7,t.s*.3,"#607d67");ctx.fillStyle="#6a5140";ctx.fillRect(t.x-2,t.y,4,t.s);ellipse(t.x,t.y,t.s,t.s*.8,"#3c735b");ellipse(t.x-4,t.y-5,t.s*.6,t.s*.5,"#6aa078");});
 cabin(432,265,"#d1b690");cabin(551,250,"#b9a7a0");cabin(478,365,"#c8a880");cabin(579,358,"#d8bd97");
 if(world){world.inhabitants.forEach((p,i)=>{const x=p.x*10+Math.sin(frame/90+i)*3,y=p.y*5.6+Math.cos(frame/100+i)*3;ellipse(x,y+4,6,3,"#6c8668");ellipse(x,y,5,7,["#f2d3a0","#e9baa4","#c5d9cc"][i%3]);});const darkness=world.hour<6||world.hour>19?.34:.03;ctx.fillStyle=`rgba(9,20,42,${darkness})`;ctx.fillRect(0,0,1000,560);}
 requestAnimationFrame(draw);
}
async function refresh(){try{const r=await fetch("/api/world",{cache:"no-store"});if(!r.ok)throw Error("World unavailable");world=await r.json();document.querySelector("#clock").textContent=`DAY ${world.day} · ${String(world.hour).padStart(2,"0")}:00 · ${world.season.toUpperCase()}`;document.querySelector("#status").textContent=`${world.inhabitants.length} inhabitants · ${world.settlements.length} settlement · ${world.tick} simulated hours`;document.querySelector("#events").replaceChildren(...world.events.slice(0,6).map(e=>{const li=document.createElement("li");li.textContent=e.text;return li;}));}catch(e){document.querySelector("#status").textContent="The world is temporarily sleeping.";}}
draw();refresh();setInterval(refresh,30000);
