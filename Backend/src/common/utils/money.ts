// Allocate integer cents by largest remainder; per-ticket totals always match the payment.
export function allocateMoney(total: number, weights: number[]): number[] {
    if (!Number.isFinite(total) || total<0 || weights.some(w=>!Number.isFinite(w)||w<0)) throw new Error('Invalid monetary allocation');
    const cents=Math.round(total*100);
    const weight=weights.reduce((sum,w)=>sum+w,0);
    if (!weight) {
        if(cents) throw new Error('Cannot allocate money without weights');
        return weights.map(()=>0);
    }
    const exact=weights.map(w=>cents*w/weight);
    const allocated=exact.map(Math.floor);
    let remaining=cents-allocated.reduce((sum,n)=>sum+n,0);
    const order=exact.map((n,i)=>({i,fraction:n-allocated[i]})).sort((a,b)=>b.fraction-a.fraction || a.i-b.i);
    for(const {i} of order) {if(!remaining)break;allocated[i]++;remaining--;}
    return allocated.map(n=>n/100);
}
