export type RankingWeights={price:number;delivery:number;trust:number;color:number};
export const scoreClamp=(n:number)=>Math.max(0,Math.min(100,n));
export function weightedScore(weights:RankingWeights,scores:RankingWeights,colorActive:boolean){
  const active={...weights,color:colorActive?weights.color:0};
  const sum=Object.values(active).reduce((a,b)=>a+b,0);
  return sum?Object.entries(active).reduce((n,[key,w])=>n+w*scores[key as keyof RankingWeights],0)/sum:0;
}
