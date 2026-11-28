export const REQ211_FETCH_TIMEOUT_MS=15_000;
export const fixtureBoundary={calls:0};
export async function withCompetitionPermit<T>(_binding:unknown,_placeholder:string,_text:string,send:()=>Promise<T>){
 fixtureBoundary.calls++;
 return send();
}
