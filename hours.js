// Small OSM opening_hours evaluator. Returns true/false, or null when unknown/unsupported.
const DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];
function parseDays(s){
  const set=new Set();
  for(const part of s.split(',')){
    const m=part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if(!m) return null;
    let a=(DAYS.indexOf(m[1])+6)%7, b=m[2]?(DAYS.indexOf(m[2])+6)%7:a; // Mo=0
    for(let i=a;;i=(i+1)%7){set.add((i+1)%7);if(i===b)break}
  }
  return set; // JS getDay numbering
}
function parseTimes(s){
  const out=[];
  for(const part of s.split(',')){
    const m=part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if(!m) return null;
    out.push([+m[1]*60+ +m[2], +m[3]*60+ +m[4]]);
  }
  return out;
}
function isOpenNow(oh,now=new Date()){
  if(!oh) return null;
  oh=oh.trim();
  if(oh==='24/7') return true;
  oh=oh.replace(/,\s*PH\b/g,'').replace(/;?\s*PH\s+off/g,'');
  if(/PH|SH|week|\[|sunrise|sunset|easter|"/.test(oh)) return null;
  oh=oh.replace(/(?<=\d),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)/g,';');
  const day=now.getDay(), min=now.getHours()*60+now.getMinutes(), prev=(day+6)%7;
  let open=null, prevOpen=false;
  for(let rule of oh.split(';')){
    rule=rule.trim(); if(!rule) continue;
    let m=rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?\s*)+)\s*(.*)$/);
    let days=null, rest=rule;
    if(m){days=parseDays(m[1].replace(/\s/g,'')); rest=m[2].trim(); if(!days) return null}
    if(!m && /^[A-Za-z]/.test(rule) && !/^off$/i.test(rule)) return null;
    const applies=!days||days.has(day), appliesPrev=!days||days.has(prev);
    if(/^(off|closed)$/i.test(rest)){ if(applies) open=false; if(appliesPrev) prevOpen=false; continue }
    if(rest==='24/7'||rest===''&&days){ if(applies) open=true; continue }
    const t=parseTimes(rest); if(!t) return null;
    if(applies){ open=t.some(([a,b])=> b>a ? (min>=a&&min<b) : (min>=a)) }
    if(appliesPrev && t.some(([a,b])=> b<=a && min<b)) prevOpen=true;
  }
  if(open===null) open=false;
  return open||prevOpen;
}
