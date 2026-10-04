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
const ENDPOINTS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const $=id=>document.getElementById(id);
const state={pos:{lat:52.5200,lon:13.4050},cats:new Set(['pharmacy']),radius:1000,open:false,items:[],favs:[]};
const map=L.map('map',{zoomControl:false}).setView([state.pos.lat,state.pos.lon],15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
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
async function overpass(q){
  let err;
  for(const u of ENDPOINTS){
    try{const r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent(q)});
      if(!r.ok)throw new Error(r.status);return (await r.json()).elements}catch(e){err=e}
  }
  throw err;
}
let seq=0;
async function search(){
  const my=++seq,{lat,lon}=state.pos;
  ring.setRadius(state.radius);
  if(!state.cats.size){state.items=[];render();return}
  $('status').textContent='Searching...';
  const parts=[...state.cats].map(c=>`nwr${CATS[c].q}(around:${state.radius},${lat},${lon});`).join('');
  try{
    const els=await overpass(`[out:json][timeout:25];(${parts});out center tags;`);
    if(my!==seq)return;
    state.items=els.map(e=>{
      const t=e.tags||{},la=e.lat??e.center?.lat,lo=e.lon??e.center?.lon;
      const cat=[...state.cats].find(c=>matches(c,t))||'';
      return{name:t.name||t.brand||CATS[cat]?.label||'Unnamed',cat,lat:la,lon:lo,oh:t.opening_hours,
        addr:[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),fav:false};
    }).filter(i=>i.lat);
    render();
  }catch(e){if(my===seq)$('status').textContent='Overpass is busy, try again'}
}
function matches(c,t){const m=[...CATS[c].q.matchAll(/\["(\w+)"(~|=)"([^"]+)"\]/g)][0];
  return m[2]==='='?t[m[1]]===m[3]:new RegExp(m[3]).test(t[m[1]]||'')}
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
    li.onclick=e=>{if(e.target.tagName!=='A')map.setView([i.lat,i.lon],17)};
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
fetch('favorites.json').then(r=>r.json()).catch(()=>[]).then(f=>{state.favs=f;search()});
