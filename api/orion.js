const TOKEN='0x3bfe8d90300cdceec661144ee6415e88c6f43517';
const SF='https://signal.family';

function n(v){
  if(typeof v==='number' && Number.isFinite(v)) return v;
  if(typeof v==='string'){
    const x=Number(v.replace(/[$,\s]/g,''));
    if(Number.isFinite(x)) return x;
  }
  return null;
}
function norm(k){return String(k).toLowerCase().replace(/[^a-z0-9]/g,'')}
function findByKeys(o, keys){
  const wanted=new Set(keys.map(norm));
  const seen=new Set();
  function walk(v){
    if(!v || typeof v!=='object' || seen.has(v)) return null;
    seen.add(v);
    if(Array.isArray(v)){for(const x of v){const r=walk(x);if(r!==null)return r}return null}
    for(const [k,val] of Object.entries(v)) if(wanted.has(norm(k))){const x=n(val);if(x!==null)return x}
    for(const val of Object.values(v)){const r=walk(val);if(r!==null)return r}
    return null;
  }
  return walk(o);
}
function findLoose(o, tests){
  const seen=new Set();
  function walk(v){
    if(!v || typeof v!=='object' || seen.has(v)) return null;
    seen.add(v);
    if(Array.isArray(v)){for(const x of v){const r=walk(x);if(r!==null)return r}return null}
    for(const [k,val] of Object.entries(v)){
      const kk=norm(k);
      if(tests.some(t=>t(kk))){const x=n(val);if(x!==null)return x}
    }
    for(const val of Object.values(v)){const r=walk(val);if(r!==null)return r}
    return null;
  }
  return walk(o);
}
function tokenMatches(v){
  if(!v || typeof v!=='object') return false;
  const s=JSON.stringify(v).toLowerCase();
  return s.includes(TOKEN.toLowerCase()) || s.includes('orion');
}
function collectRewardCandidates(v,out=[],depth=0){
  if(depth>8 || !v || typeof v!=='object') return out;
  if(Array.isArray(v)){for(const x of v) collectRewardCandidates(x,out,depth+1); return out}
  const matches=tokenMatches(v);
  for(const [k,val] of Object.entries(v)){
    const kk=norm(k);
    if(matches && /holder|creator/.test(kk) && /paid|payout|reward|share/.test(kk)){
      const x=n(val); if(x!==null) out.push({key:k,value:x});
    }
    if(val && typeof val==='object') collectRewardCandidates(val,out,depth+1);
  }
  return out;
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=15, stale-while-revalidate=30');
  try{
    const [tr,rr,hr]=await Promise.all([
      fetch(`${SF}/api/token/${TOKEN}`,{headers:{accept:'application/json'}}),
      fetch(`${SF}/api/revenue?range=all`,{headers:{accept:'application/json'}}),
      fetch('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'allMids'})})
    ]);
    const token=await tr.json();
    const revenue=await rr.json();
    const mids=await hr.json();
    const holders=findByKeys(token,['holders','holderCount','holdersCount','uniqueHolders','holder_count']) ?? findLoose(token,[k=>k.includes('holder')&&k.includes('count')]);
    const mcap=findByKeys(token,['mcap','marketCap','market_cap','marketcap','fdv']) ?? findLoose(token,[k=>k.includes('mcap')||k.includes('marketcap')]);
    let reward=findByKeys(token,['holderRewardsPaid','holder_reward_fees_paid','holderRewardFeesPaid','paidToHolders','holdersPaid','holderPayouts','holderRewards','creatorSharePaidToHolders','creatorShareToHolders']);
    let source='token';
    if(reward===null){
      const c=collectRewardCandidates(revenue);
      if(c.length){
        // Prefer the most explicit holder-paid field; avoid summing overlapping nested totals.
        const preferred=c.filter(x=>/paid|payout/.test(norm(x.key)));
        const list=preferred.length?preferred:c;
        reward=list.reduce((s,x)=>s+x.value,0); source='revenue';
      }
    }
    const hypePrice=n(mids?.HYPE ?? mids?.hype ?? mids?.WHYPE);
    res.status(200).json({ok:true,holders,mcap,rewardHype:reward,hypePrice,source,debug:{tokenKeys:Object.keys(token||{}),rewardCandidates:collectRewardCandidates(revenue).slice(0,20)}});
  }catch(e){
    res.status(502).json({ok:false,error:String(e?.message||e)});
  }
}
