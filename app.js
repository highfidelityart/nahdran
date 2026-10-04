const CATS={
  pharmacy:{label:'Pharmacy',q:'["amenity"="pharmacy"]'},
  cafe:{label:'Cafe',q:'["amenity"="cafe"]'},
  supermarket:{label:'Supermarket',q:'["shop"="supermarket"]'},
  bakery:{label:'Bakery',q:'["shop"="bakery"]'},
  drugstore:{label:'Drugstore',q:'["shop"="chemist"]'},
  restaurant:{label:'Restaurant',q:'["amenity"="restaurant"]'},
  atm:{label:'ATM',q:'["amenity"="atm"]'},
  toilets:{label:'Toilets',q:'["amenity"="toilets"]'},
  kiosk:{label:'Spati / kiosk',q:'["shop"~"kiosk|convenience"]'},
  bar:{label:'Bar',q:'["amenity"~"bar|pub"]'},
};
const $=id=>document.getElementById(id);
const state={pos:{lat:52.5200,lon:13.4050},cats:new Set(['pharmacy']),radius:1000,open:false,items:[],favs:[]};
const map=L.map('map',{zoomControl:false,attributionControl:false}).setView([state.pos.lat,state.pos.lon],15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
L.control.attribution({position:'topleft',prefix:false}).addTo(map);
const me=L.circleMarker([state.pos.lat,state.pos.lon],{radius:8,color:'#fff',fillColor:'#fb8f62',fillOpacity:1,weight:2}).addTo(map);
const ring=L.circle([state.pos.lat,state.pos.lon],{radius:state.radius,color:'#fb8f62',weight:1,fillOpacity:.05}).addTo(map);
const layer=L.layerGroup().addTo(map);

function dist(a,b,c,d){const R=6371000,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r*Math.cos((a+c)/2*r);return Math.sqrt(x*x+y*y)*R}
const fmtD=m=>m<1000?Math.round(m/10)*10+' m':(m/1000).toFixed(1)+' km';
function setPos(lat,lon,fly){
  state.pos={lat,lon};me.setLatLng([lat,lon]);ring.setLatLng([lat,lon]);
  if(fly)map.setView([lat,lon],Math.max(map.getZoom(),15));
  search();
}
let ALL=[];let generated=null;
async function loadPlaces(){
  try{const idx=await (await fetch('data/index.json')).json();generated=idx.generated;
    const parts=await Promise.all(Array.from({length:idx.parts},(_,i)=>fetch('data/places-'+i+'.json').then(r=>r.json())));
    ALL=parts.flat().map(p=>({cat:p[0],lat:p[1],lon:p[2],name:p[3],addr:p[4],oh:p[5]}));
    const when=new Date(generated).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    $('fresh').textContent='Place data from '+when+' ('+ALL.length.toLocaleString('en')+' places, refreshed weekly).';
  }catch(e){$('status').textContent='Could not load places data'}
}
function search(){
  ring.setRadius(state.radius);
  const {lat,lon}=state.pos;
  state.items=ALL.filter(p=>state.cats.has(p.cat)&&dist(lat,lon,p.lat,p.lon)<=state.radius).map(p=>({...p,name:p.name||CATS[p.cat].label,fav:false}));
  render();
}
function render(){
  const {lat,lon}=state.pos;
  const favs=state.favs.filter(f=>state.cats.has(f.category)).map(f=>({name:f.name,cat:f.category,lat:f.lat,lon:f.lon,oh:f.opening_hours,addr:f.note,fav:true}));
  // drop OSM duplicates of favorites (within 30 m)
  const osm=state.items.filter(i=>!favs.some(f=>dist(f.lat,f.lon,i.lat,i.lon)<30));
  let all=[...favs,...osm].map(i=>({...i,d:dist(lat,lon,i.lat,i.lon),open:isOpenNow(i.oh)}));
  all=all.filter(i=>i.d<=state.radius);
  if(state.open)all=all.filter(i=>i.open===true);
  all.sort((a,b)=>b.fav-a.fav||a.d-b.d);
  layer.clearLayers();$('list').innerHTML='';
  for(const i of all){
    L.circleMarker([i.lat,i.lon],{radius:i.fav?7:5,color:i.fav?'#fb8f62':'#888',fillColor:i.fav?'#fb8f62':'#bbb',fillOpacity:.9,weight:1}).addTo(layer).bindPopup(i.name);
    const li=document.createElement('li');if(i.fav)li.className='fav';
    const b=i.open===true?'<span class="b o">open now</span>':i.open===false?'<span class="b c">closed</span>':'<span class="b u">hours unknown</span>';
    const url=`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${lat},${lon};${i.lat},${i.lon}`;
    li.innerHTML=`<div><div class="n">${i.fav?'&#9733; ':''}${esc(i.name)}</div><div class="s">${esc(CATS[i.cat]?.label||'')}${i.addr?' - '+esc(i.addr):''}</div>${b}${i.oh?`<div class="s">${esc(i.oh)}</div>`:''}</div><div class="d">${fmtD(i.d)}<br><a href="${url}" target="_blank" rel="noopener">walk</a></div>`;
    li.onclick=e=>{if(e.target.tagName!=='A'){setSheet(1);map.setView([i.lat,i.lon],17)}};
    $('list').appendChild(li);
  }
  $('status').textContent=all.length+' places';
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
for(const [k,v] of Object.entries(CATS)){
  const b=document.createElement('button');b.className='chip'+(state.cats.has(k)?' on':'');b.textContent=v.label;
  b.onclick=()=>{state.cats.has(k)?state.cats.delete(k):state.cats.add(k);b.classList.toggle('on');search()};
  $('cats').appendChild(b);
}
$('radius').oninput=e=>{state.radius=+e.target.value;$('rv').textContent=state.radius>=1000?state.radius/1000+' km':state.radius+' m';ring.setRadius(state.radius)};
$('radius').onchange=search;
$('open').onchange=e=>{state.open=e.target.checked;render()};
map.on('click',e=>setPos(e.latlng.lat,e.latlng.lng,false));
$('gps').onclick=()=>{
  if(!navigator.geolocation){$('status').textContent='No GPS available';return}
  $('status').textContent='Locating...';
  navigator.geolocation.getCurrentPosition(p=>setPos(p.coords.latitude,p.coords.longitude,true),()=>{$('status').textContent='GPS denied - tap the map instead'},{enableHighAccuracy:true,timeout:10000});
};
Promise.all([fetch('favorites.json').then(r=>r.json()).catch(()=>[]),loadPlaces()]).then(([f])=>{state.favs=f;search()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
window.addEventListener('offline',()=>$('fresh').textContent+=' Offline: map tiles only where already viewed.');

// Bottom sheet: min (handle + filters), peek (first results), full
const sheet=$('sheet'),grab=$('grab');
const snaps=()=>{const H=innerHeight;return [92,Math.min(300,H*.4),H-(innerWidth>=800?60:90)]};
let snap=1;
function setSheet(i){snap=i;sheet.classList.toggle('full',i===2);sheet.style.setProperty('--sh',snaps()[i]+'px')}
setSheet(1);addEventListener('resize',()=>setSheet(snap));
let drag=null;
grab.addEventListener('pointerdown',e=>{grab.setPointerCapture(e.pointerId);drag={y:e.clientY,h:sheet.offsetHeight,moved:false};sheet.classList.add('drag')});
grab.addEventListener('pointermove',e=>{if(!drag)return;const dy=drag.y-e.clientY;if(Math.abs(dy)>4)drag.moved=true;
  const s=snaps();sheet.style.setProperty('--sh',Math.max(s[0],Math.min(s[2],drag.h+dy))+'px')});
grab.addEventListener('pointerup',e=>{if(!drag)return;sheet.classList.remove('drag');
  if(!drag.moved){setSheet(snap===0?1:snap===1?2:1)}
  else{const h=sheet.offsetHeight,s=snaps();setSheet(s.reduce((b,v,i)=>Math.abs(v-h)<Math.abs(s[b]-h)?i:b,0))}
  drag=null});
